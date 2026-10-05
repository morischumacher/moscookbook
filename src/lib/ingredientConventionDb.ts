import prisma from './prisma';
import type { Prisma } from '@prisma/client';
import { conventional, conventionalRows } from './ingredientShape';
import { withHeadingRows } from './ingredientParts';
import { sourceKey, storedRows } from './recipeTranslation';
import { snapshotOf } from './revisions';
import { keepRevisionOf } from './revisionsDb';

/**
 * The recipes written before the convention (lib/ingredientShape), brought
 * into it: "frischer Ingwer" → "Ingwer, frisch", in the recipe and in its
 * translation alike. Done once by itself after a deploy (`ensureConvention`);
 * every recipe it changes keeps its version from before in its history.
 *
 * When the rules in lib/ingredientShape change, raise VERSION: the recipes
 * are brought into the new rules the same way.
 */
const VERSION = '1';
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

    await applyConvention(null);
    await prisma.appSetting.update({ where: { key: FLAG }, data: { value: VERSION } });
    settled = true;
}

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
    ingredients: { orderBy: { position: 'asc' as const }, select: { id: true, raw: true, name: true, section: true } },
    translations: { select: { id: true, locale: true, ingredients: true, source: true } },
};

type Row = Awaited<ReturnType<typeof load>>[number];

function load() {
    return prisma.recipe.findMany({ select, orderBy: { id: 'asc' } });
}

/** What the source key of a recipe is, built as the edit form and the page build it. */
function keyOf(recipe: Row, names: string[]) {
    return sourceKey({
        title: recipe.title,
        description: recipe.description ?? '',
        instructions: recipe.instructions,
        tips: recipe.tips,
        ingredients: withHeadingRows(recipe.ingredients.map((row, index) => ({ amount: row.raw, item: names[index], section: row.section }))),
    });
}

/** All of them changed. A translation that was up to date stays up to date. Returns how many recipes changed. */
export async function applyConvention(editedBy: string | null): Promise<number> {
    const recipes = await load();
    let changed = 0;
    for (const recipe of recipes) {
        const names = recipe.ingredients.map((row) => conventional(row.name));
        const translations = recipe.translations.map((translation) => {
            const rows = storedRows(translation.ingredients);
            const next = conventionalRows(rows);
            return { translation, next, moved: next.some((row, index) => row.item !== rows[index].item) };
        });
        const rowsMoved = names.some((name, index) => name !== recipe.ingredients[index].name);
        if (!rowsMoved && !translations.some((entry) => entry.moved)) continue;

        const before = keyOf(recipe, recipe.ingredients.map((row) => row.name));
        const after = keyOf(recipe, names);
        if (rowsMoved) await keepRevisionOf(recipe.id, snapshotOf(recipe), editedBy);

        await prisma.$transaction([
            ...recipe.ingredients.flatMap((row, index) => (names[index] !== row.name ? [prisma.ingredient.update({ where: { id: row.id }, data: { name: names[index] } })] : [])),
            ...translations.flatMap(({ translation, next, moved }) => {
                // Up to date before: up to date after — the same change was made on both sides.
                const fresh = Boolean(translation.source) && translation.source === before;
                if (!moved && !(fresh && before !== after)) return [];
                return [
                    prisma.recipeTranslation.update({
                        where: { id: translation.id },
                        data: { ingredients: next as unknown as Prisma.InputJsonValue, ...(fresh ? { source: after } : {}) },
                    }),
                ];
            }),
        ]);
        changed += 1;
    }
    return changed;
}
