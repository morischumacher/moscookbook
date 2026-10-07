import prisma from './prisma';
import type { Prisma } from '@prisma/client';
import { CONVENTION_RULE, conventional, needsReading } from './ingredientShape';
import { capitalized, sectionHeading, withHeadingRows } from './ingredientParts';
import { aiCapability } from './aiConfig';
import { canUseAi, smallModelFor } from './aiProviders';
import { completeWithKey, extractJson } from './aiImport';
import { usageRecorder } from './tokenUsageDb';
import { keptTranslation, recipeColumns } from './recipeRepo';
import { forgetCollectionFacets } from './collectionFacets';
import { sourceKey, storedRows } from './recipeTranslation';
import { snapshotOf } from './revisions';
import { keepRevisionOf } from './revisionsDb';

/**
 * The recipes written before the convention (lib/ingredientShape), brought
 * into it: "frischer Ingwer" → "Ingwer, frisch", "garlic" → "Garlic", in the recipe and in its
 * translation alike. Done once by itself after a deploy (`ensureConvention`);
 * every recipe it changes keeps its version from before in its history.
 *
 * The rules move only what they are sure of. A name they cannot vouch for
 * ("fermentierte, gesalzene Garnelen mit der salzigen Lauge, gehackt
 * (Saeujeot)") is read once by the AI — the small model, all of them in a few
 * calls — and its answer kept, so a run cut short carries on where it stopped.
 * Without an AI the rules' part is done and the rest waits a day for one.
 *
 * When the rules in lib/ingredientShape change, raise VERSION: the recipes
 * are brought into the new rules the same way.
 */
const VERSION = '3';
const AI_ANSWERS = 'ingredients.convention.ai';
const FLAG = 'ingredients.convention';
let settled = false;

/**
 * Brings every recipe into the convention unless that was done for this
 * VERSION. Cheap after the first time (a flag in memory). Two servers at once:
 * the first to claim the flag does it, the other leaves it be.
 */
export async function ensureConvention(): Promise<void> {
    if (settled) return;
    const row = await prisma.appSetting.findUnique({ where: { key: FLAG }, select: { value: true } }).catch(() => null);
    if (row?.value === VERSION) {
        settled = true;
        return;
    }
    // Being done right now, by a request not ten minutes ago.
    const running = /^running:(\d+)$/.exec(row?.value ?? '');
    if (running && Date.now() - Number(running[1]) < 10 * 60_000) return;

    const claim = `running:${Date.now()}`;
    const claimed = row
        ? (await prisma.appSetting.updateMany({ where: { key: FLAG, value: row.value }, data: { value: claim } })).count === 1
        : await prisma.appSetting
              .create({ data: { key: FLAG, value: claim } })
              .then(() => true)
              .catch(() => false);
    if (!claimed) return;

    // Waiting for an AI: tried again a day later.
    const waiting = /^waiting:(\d+)$/.exec(row?.value ?? '');
    if (waiting && Date.now() - Number(waiting[1]) < 24 * 3600_000) {
        settled = true;
        return;
    }

    const answers = await readAnswers();
    const unread = await askAi(answers);
    await applyConvention(null, (name) => answers.get(conventional(name)) ?? conventional(name));
    await prisma.appSetting.update({ where: { key: FLAG }, data: { value: unread > 0 ? `waiting:${Date.now()}` : VERSION } });
    settled = true;
}

async function readAnswers(): Promise<Map<string, string>> {
    const row = await prisma.appSetting.findUnique({ where: { key: AI_ANSWERS }, select: { value: true } }).catch(() => null);
    try {
        // Kept from before every name started with a capital: read as it is written now, so none is asked again.
        return new Map(Object.entries(JSON.parse(row?.value ?? '{}') as Record<string, string>).map(([name, answer]) => [capitalized(name), capitalized(answer)]));
    } catch {
        return new Map();
    }
}

/** Every name, recipe rows and translations, the rules could not vouch for and the AI has not yet read. */
async function unreadNames(answers: Map<string, string>): Promise<string[]> {
    const recipes = await load();
    const names = new Set<string>();
    for (const recipe of recipes) {
        for (const row of recipe.ingredients) names.add(conventional(row.name));
        for (const translation of recipe.translations) {
            for (const row of storedRows(translation.ingredients)) if (sectionHeading(row) === null) names.add(conventional(row.item));
        }
    }
    return [...names].filter((name) => name && needsReading(name) && !answers.has(name));
}

/** The words a rewrite's ingredient must come from: it may reorder, never invent. */
const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

/**
 * Asks the AI for the names in `answers`' gaps, in chunks, keeping each
 * chunk's answers as it goes. Returns how many are still unread.
 */
async function askAi(answers: Map<string, string>): Promise<number> {
    const unread = await unreadNames(answers);
    if (unread.length === 0) return 0;
    const ai = await aiCapability();
    if (!canUseAi(ai)) return unread.length;
    const key = ai.keys[0];
    const small = { ...key, model: key.small ?? smallModelFor(key) ?? key.model };
    const usage = usageRecorder('ingredients');
    let left = unread.length;
    try {
        for (let at = 0; at < unread.length; at += 60) {
            const chunk = unread.slice(at, at + 60);
            const text = chunk.map((name, index) => `${index + 1}: ${name}`).join('\n');
            const answer = extractJson(await completeWithKey(small, { kind: 'raw', system: READ_PROMPT, text }, usage.report).catch(() => '')) as Record<string, unknown> | null;
            chunk.forEach((name, index) => {
                const raw = answer && typeof answer[String(index + 1)] === 'string' ? (answer[String(index + 1)] as string) : null;
                const tidy = raw ? conventional(raw.slice(0, 200)) : '';
                const base = tidy.split(/[,(]/)[0];
                const source = new Set(words(name));
                // Kept as it was when the answer is empty or names something not in the original.
                answers.set(name, tidy && words(base).every((word) => source.has(word) || [...source].some((known) => known.includes(word))) ? tidy : name);
            });
            left -= chunk.length;
            const value = JSON.stringify(Object.fromEntries(answers));
            await prisma.appSetting.upsert({ where: { key: AI_ANSWERS }, update: { value }, create: { key: AI_ANSWERS, value } });
        }
    } finally {
        await usage.flush();
    }
    return left;
}

const READ_PROMPT = `You tidy the ingredient lines of a German/English personal cookbook into its one way of writing them.

You receive numbered lines, each one ingredient as written in a recipe (German or English).

${CONVENTION_RULE}

Rules:
- Keep the language of each line. Never translate, never add or drop information:
  everything that was there is still there, in the ingredient, the preparation or the notes.
- The ingredient is what is bought, as short as a shopping list writes it
  ("Saeujeot", "Garnelen", "Hähnchenschenkel"); descriptions go into the notes.
- A line that already follows the convention comes back unchanged.
- A line naming two things ("Salz und Pfeffer", "chicken or tofu") stays as it is.

Return JSON only: {"1": "…", "2": "…"} — one entry per line number. No explanation, no code fences.`;

const select = {
    id: true,
    title: true,
    slug: true,
    description: true,
    category: true,
    nationality: true,
    instructions: true,
    tips: true,
    servings: true,
    prepMinutes: true,
    cookMinutes: true,
    tags: true,
    ingredients: { orderBy: { position: 'asc' as const }, select: { id: true, raw: true, name: true, section: true, quantity: true, quantityMax: true, unit: true } },
    translations: { select: { id: true, locale: true, ingredients: true, source: true } },
};

type Row = Awaited<ReturnType<typeof load>>[number];

function load() {
    return prisma.recipe.findMany({ select, orderBy: { id: 'asc' } });
}

/** What the source key of a recipe is, built as the edit form and the page build it. */
function keyOf(recipe: Row, names: string[], keepCase = false) {
    return sourceKey(
        {
            title: recipe.title,
            description: recipe.description ?? '',
            instructions: recipe.instructions,
            tips: recipe.tips,
            ingredients: withHeadingRows(recipe.ingredients.map((row, index) => ({ amount: row.raw, item: names[index], section: row.section }))),
        },
        keepCase
    );
}

/** All of them changed. A translation that was up to date stays up to date. Returns how many recipes changed. */
export async function applyConvention(editedBy: string | null, rewrite: (name: string) => string = conventional): Promise<number> {
    const recipes = await load();
    let changed = 0;
    for (const recipe of recipes) {
        const names = recipe.ingredients.map((row) => rewrite(row.name));
        const translations = recipe.translations.map((translation) => {
            const rows = storedRows(translation.ingredients);
            const next = rows.map((row) => (sectionHeading(row) !== null ? row : { ...row, item: rewrite(row.item) }));
            return { translation, next, moved: next.some((row, index) => row.item !== rows[index].item) };
        });
        const rowsMoved = names.some((name, index) => name !== recipe.ingredients[index].name);
        if (!rowsMoved && !translations.some((entry) => entry.moved)) continue;

        const before = keyOf(recipe, recipe.ingredients.map((row) => row.name));
        // Stamped before every name started with a capital: up to date all the same.
        const beforeAsTyped = keyOf(recipe, recipe.ingredients.map((row) => row.name), true);
        const after = keyOf(recipe, names);
        if (rowsMoved) await keepRevisionOf(recipe.id, snapshotOf(recipe), editedBy);

        await prisma.$transaction([
            ...recipe.ingredients.flatMap((row, index) => (names[index] !== row.name ? [prisma.ingredient.update({ where: { id: row.id }, data: { name: names[index] } })] : [])),
            ...translations.flatMap(({ translation, next, moved }) => {
                // Up to date before: up to date after — the same change was made on both sides.
                const fresh = Boolean(translation.source) && (translation.source === before || translation.source === beforeAsTyped);
                if (!moved && !(fresh && translation.source !== after)) return [];
                return [
                    prisma.recipeTranslation.update({
                        where: { id: translation.id },
                        data: { ingredients: next as unknown as Prisma.InputJsonValue, ...(fresh ? { source: after } : {}) },
                    }),
                ];
            }),
        ]);
        // The search columns know the new names too ("Saeujeot"), as every writer of a recipe (lib/recipeRepo).
        await prisma.recipe.update({
            where: { id: recipe.id },
            data: recipeColumns({
                ...recipe,
                tips: recipe.tips ?? '',
                ingredients: recipe.ingredients.map((row, index) => ({ ...row, name: names[index] })),
                translation: await keptTranslation(recipe.id),
            }),
        });
        changed += 1;
    }
    // Names only — no category moves; the cached filter rail is cleared all the same, as every writer does.
    if (changed > 0) forgetCollectionFacets();
    return changed;
}
