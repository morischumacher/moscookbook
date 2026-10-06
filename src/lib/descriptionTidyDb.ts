import prisma from './prisma';
import { withHeadingRows } from './ingredientParts';
import { sourceKey, storedRows } from './recipeTranslation';
import { snapshotOf } from './revisions';
import { keepRevisionOf } from './revisionsDb';
import { keptTranslation, recipeColumns } from './recipeRepo';
import { forgetCollectionFacets } from './collectionFacets';
import { tidyDescription } from './descriptionTidy';

/**
 * Once after a deploy: the descriptions imported before lib/descriptionTidy —
 * a whole Instagram caption with its counters, the recipe a second time and
 * the hashtags — tidied, in the recipe and in its translation. A
 * translation that was up to date stays so. Every recipe changed keeps its
 * version from before.
 */
const FLAG = 'recipes.descriptions';
const VERSION = '1';
let settled = false;

export async function ensureDescriptionsTidy(): Promise<void> {
    if (settled) return;
    const row = await prisma.appSetting.findUnique({ where: { key: FLAG }, select: { value: true } }).catch(() => null);
    if (row?.value === VERSION) {
        settled = true;
        return;
    }
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

    const recipes = await prisma.recipe.findMany({
        where: { NOT: { description: null } },
        select: {
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
            language: true,
            ingredients: { orderBy: { position: 'asc' }, select: { raw: true, name: true, section: true, quantity: true, quantityMax: true, unit: true } },
            translations: { select: { id: true, description: true, ingredients: true, source: true } },
        },
    });
    let changed = 0;
    for (const recipe of recipes) {
        const description = tidyDescription(
            recipe.description ?? '',
            recipe.ingredients.map((row) => ({ item: row.name })),
        );
        const translations = recipe.translations.map((translation) => ({
            translation,
            description: tidyDescription(translation.description, storedRows(translation.ingredients)),
        }));
        const own = description !== (recipe.description ?? '');
        if (!own && translations.every((entry) => entry.description === entry.translation.description)) continue;

        const keyWith = (text: string) =>
            sourceKey({
                title: recipe.title,
                description: text,
                instructions: recipe.instructions,
                tips: recipe.tips,
                ingredients: withHeadingRows(recipe.ingredients.map((row) => ({ amount: row.raw, item: row.name, section: row.section }))),
            });
        const before = keyWith(recipe.description ?? '');
        const after = keyWith(description);
        if (own) await keepRevisionOf(recipe.id, snapshotOf({ ...recipe, tips: recipe.tips ?? '' }), null);
        await prisma.$transaction(
            translations.flatMap(({ translation, description: next }) => {
                const fresh = Boolean(translation.source) && translation.source === before;
                if (next === translation.description && !(fresh && before !== after)) return [];
                return [prisma.recipeTranslation.update({ where: { id: translation.id }, data: { description: next, ...(fresh ? { source: after } : {}) } })];
            }),
        );
        // The text with its search columns, as every writer of a recipe (lib/recipeRepo).
        await prisma.recipe.update({
            where: { id: recipe.id },
            data: recipeColumns({ ...recipe, description, tips: recipe.tips ?? '', translation: await keptTranslation(recipe.id) }),
        });
        changed += 1;
    }
    // Text only — no category moves; the cached filter rail is cleared all the same, as every writer does.
    if (changed > 0) forgetCollectionFacets();
    await prisma.appSetting.update({ where: { key: FLAG }, data: { value: VERSION } });
    settled = true;
}
