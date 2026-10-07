import prisma from './prisma';
import { withHeadingRows } from './ingredientParts';
import { guessLanguage, sourceKey } from './recipeTranslation';
import { snapshotOf } from './revisions';
import { keepRevisionOf } from './revisionsDb';
import { aiCapability } from './aiConfig';
import { canUseAi, smallModelFor } from './aiProviders';
import { completeWithKey } from './aiImport';
import { usageRecorder } from './tokenUsageDb';
import { GERMAN_VOICE, needsVoice, sameContent } from './writingVoice';
import { keptTranslation, recipeColumns } from './recipeRepo';
import { forgetCollectionFacets } from './collectionFacets';

/**
 * The recipes written before the cookbook's German voice (lib/writingVoice)
 * brought into it: "Geben Sie die Zwiebeln dazu" and "Zwiebeln dazugeben" →
 * "Gib die Zwiebeln dazu", in the method and the tips, of German recipes and
 * of German translations alike.
 *
 * Done by itself after a deploy, a few texts per run (each is one call to the
 * small model), until none is left. A rewrite is only taken when it keeps
 * every number and every step — otherwise the text stays as it was and is not
 * asked about again. Every recipe changed keeps its version from before.
 */
const FLAG = 'recipes.voice';
const KEPT = 'recipes.voice.kept';
const VERSION = '1';
const PER_RUN = 12;
let settled = false;

const PROMPT = `You rewrite a German recipe text (a method or tips) into the cookbook's one voice.

${GERMAN_VOICE}

Change ONLY the verb forms and pronouns that the voice needs. Keep every other word,
every number, time, temperature and ingredient, every step, line break, list marker and
markdown character exactly as it is. Add nothing, drop nothing.
If the text is already in that voice, return it unchanged.
Return ONLY the text, with no explanation and no code fences.`;

async function hashOf(text: string): Promise<string> {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16);
}

export async function ensureVoice(): Promise<void> {
    if (settled) return;
    const row = await prisma.appSetting.findUnique({ where: { key: FLAG }, select: { value: true } }).catch(() => null);
    if (row?.value === VERSION) {
        settled = true;
        return;
    }
    const waitFor = /^running:(\d+)$/.exec(row?.value ?? '') ? 10 * 60_000 : /^waiting:(\d+)$/.exec(row?.value ?? '') ? 24 * 3600_000 : /^more:(\d+)$/.exec(row?.value ?? '') ? 60_000 : 0;
    const since = Number((row?.value ?? '').split(':')[1] ?? 0);
    if (waitFor && Date.now() - since < waitFor) return;

    const claim = `running:${Date.now()}`;
    const claimed = row
        ? (await prisma.appSetting.updateMany({ where: { key: FLAG, value: row.value }, data: { value: claim } })).count === 1
        : await prisma.appSetting
              .create({ data: { key: FLAG, value: claim } })
              .then(() => true)
              .catch(() => false);
    if (!claimed) return;

    const left = await rewriteSome();
    await prisma.appSetting.update({ where: { key: FLAG }, data: { value: left === 0 ? VERSION : left < 0 ? `waiting:${Date.now()}` : `more:${Date.now()}` } });
    if (left === 0) settled = true;
}

/** Up to PER_RUN texts rewritten. Returns how many are left, or -1 when there is no AI to ask. */
async function rewriteSome(): Promise<number> {
    const keptRow = await prisma.appSetting.findUnique({ where: { key: KEPT }, select: { value: true } }).catch(() => null);
    let kept: Set<string>;
    try {
        kept = new Set(JSON.parse(keptRow?.value ?? '[]') as string[]);
    } catch {
        kept = new Set();
    }

    const recipes = await prisma.recipe.findMany({
        orderBy: { id: 'asc' },
        select: {
            id: true, title: true, slug: true, description: true, category: true, nationality: true, instructions: true, tips: true,
            servings: true, prepMinutes: true, cookMinutes: true, tags: true, language: true,
            ingredients: { orderBy: { position: 'asc' }, select: { raw: true, name: true, section: true, quantity: true, quantityMax: true, unit: true } },
            translations: { select: { id: true, locale: true, instructions: true, tips: true, source: true } },
        },
    });

    // Every German text still to be asked about: the recipe's own, or its German translation's.
    type Target = { recipe: (typeof recipes)[number]; translationId: number | null; field: 'instructions' | 'tips'; text: string };
    const targets: Target[] = [];
    for (const recipe of recipes) {
        const german = recipe.language === 'de' || (recipe.language !== 'en' && guessLanguage(recipe.instructions) === 'de');
        if (german) for (const field of ['instructions', 'tips'] as const) targets.push({ recipe, translationId: null, field, text: recipe[field] ?? '' });
        for (const translation of recipe.translations.filter((row) => row.locale === 'de')) {
            for (const field of ['instructions', 'tips'] as const) targets.push({ recipe, translationId: translation.id, field, text: translation[field] ?? '' });
        }
    }
    const todo: Target[] = [];
    for (const target of targets) if (needsVoice(target.text) && !kept.has(await hashOf(target.text))) todo.push(target);
    if (todo.length === 0) return 0;

    const ai = await aiCapability();
    if (!canUseAi(ai)) return -1;
    const key = ai.keys[0];
    const small = { ...key, model: key.small ?? smallModelFor(key) ?? key.model };
    const usage = usageRecorder('polish');

    let changed = false;
    try {
        for (const target of todo.slice(0, PER_RUN)) {
            const answer = (await completeWithKey(small, { kind: 'raw', system: PROMPT, text: target.text }, usage.report).catch(() => '')).trim();
            if (!sameContent(target.text, answer) || answer === target.text.trim()) {
                kept.add(await hashOf(target.text));
                continue;
            }
            const recipe = target.recipe;
            if (target.translationId === null) {
                // The original changed: its version is kept, and its translations stay as fresh as they were.
                const keyWith = (fields: { instructions: string; tips: string }, keepCase = false) =>
                    sourceKey(
                        {
                        title: recipe.title,
                        description: recipe.description ?? '',
                        instructions: fields.instructions,
                        tips: fields.tips,
                        ingredients: withHeadingRows(recipe.ingredients.map((row) => ({ amount: row.raw, item: row.name, section: row.section }))),
                        },
                        keepCase
                    );
                // Stamped either way: as keys are built now, or as before names were tidied (lib/recipeTranslation).
                const stamps = [keyWith({ instructions: recipe.instructions, tips: recipe.tips ?? '' }), keyWith({ instructions: recipe.instructions, tips: recipe.tips ?? '' }, true)];
                const isBefore = (source: string) => stamps.includes(source);
                const next = { instructions: recipe.instructions, tips: recipe.tips ?? '', [target.field]: answer };
                const after = keyWith(next);
                await keepRevisionOf(recipe.id, snapshotOf({ ...recipe, tips: recipe.tips ?? '' }), null);
                await prisma.$transaction(
                    recipe.translations.filter((row) => row.source && isBefore(row.source)).map((row) => prisma.recipeTranslation.update({ where: { id: row.id }, data: { source: after } }))
                );
                recipe[target.field] = answer;
                for (const row of recipe.translations) if (row.source && isBefore(row.source)) row.source = after;
            } else {
                await prisma.recipeTranslation.update({ where: { id: target.translationId }, data: { [target.field]: answer } });
            }
            // The text with its search columns, as every writer of a recipe (lib/recipeRepo).
            await prisma.recipe.update({
                where: { id: recipe.id },
                data: recipeColumns({ ...recipe, tips: recipe.tips ?? '', ingredients: recipe.ingredients, translation: await keptTranslation(recipe.id) }),
            });
            changed = true;
        }
    } finally {
        // Text only — no category moves; the cached filter rail is cleared all the same, as every writer does.
        if (changed) forgetCollectionFacets();
        await usage.flush();
        const value = JSON.stringify([...kept].slice(-2000));
        await prisma.appSetting.upsert({ where: { key: KEPT }, update: { value }, create: { key: KEPT, value } });
    }
    return Math.max(0, todo.length - PER_RUN);
}
