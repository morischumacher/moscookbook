import prisma from './prisma';
import type { Prisma } from '@prisma/client';
import { sectionHeading, splitAmount, withHeadingRows } from './ingredientParts';
import { keptTranslation, recipeColumns } from './recipeRepo';
import { forgetCollectionFacets } from './collectionFacets';
import { guessLanguage, sourceKey, storedRows, type RecipeLanguage } from './recipeTranslation';
import { snapshotOf } from './revisions';
import { keepRevisionOf } from './revisionsDb';

/**
 * Ingredient rows of many recipes changed at once from admin → Zutaten: a
 * name after two ingredients were merged ("Nudeln" → "Pasta"), an amount
 * after its unit was made the standard one ("2 EL" → "30 ml") — in the
 * recipe and, row for row, in its translation. The method is left alone.
 *
 * Every recipe changed keeps its version from before; a translation that was
 * up to date stays up to date, since the same change is made on both sides;
 * the search columns follow, as for every writer of a recipe (lib/recipeRepo).
 */

export interface RowEdit {
    /** The new name, or unchanged. */
    name?: string;
    /** The new amount as written ("30 ml"), or unchanged. */
    amount?: string;
}

/**
 * One row's change, or null to leave it. `rowId` and `itemId` are the recipe
 * row's, also for the translation's row beside it; `language` the language
 * of the text.
 */
export type RowEditor = (row: { rowId: number; itemId: number | null; name: string; amount: string }, language: RecipeLanguage, side: 'recipe' | 'translation') => RowEdit | null;

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
    language: true,
    ingredients: { orderBy: { position: 'asc' as const }, select: { id: true, raw: true, name: true, section: true, quantity: true, quantityMax: true, unit: true, itemId: true } },
    translations: { select: { id: true, locale: true, ingredients: true, source: true } },
};

/**
 * Changes the rows of the recipes using any of `itemIds` — or of the one
 * recipe `only`, just imported, which keeps no version from before (there
 * was none), or of the one `recipe`, which does. Returns how many recipes
 * changed.
 */
export async function rewriteRows(itemIds: number[], edit: RowEditor, editedBy: string | null, only?: number, recipe?: number): Promise<number> {
    if (itemIds.length === 0) return 0;
    const pick = only ?? recipe;
    const recipes = await prisma.recipe.findMany({
        where: { ingredients: { some: { itemId: { in: itemIds } } }, ...(pick !== undefined ? { id: pick } : {}) },
        select,
        orderBy: { id: 'asc' },
    });
    let changed = 0;
    for (const recipe of recipes) {
        const language: RecipeLanguage =
            recipe.language === 'de' || recipe.language === 'en' ? recipe.language : guessLanguage([recipe.title, ...recipe.ingredients.map((row) => row.name)].join(' '));
        const rows = recipe.ingredients.map((row) => {
            const change = edit({ rowId: row.id, itemId: row.itemId, name: row.name, amount: row.raw }, language, 'recipe');
            return { ...row, name: change?.name ?? row.name, raw: change?.amount ?? row.raw };
        });
        const moved = rows.some((row, index) => row.name !== recipe.ingredients[index].name || row.raw !== recipe.ingredients[index].raw);
        // Amounts are the same in both languages, names are each language's own: a changed amount must reach the translation.
        const amountAt = rows.flatMap((row, index) => (row.raw !== recipe.ingredients[index].raw ? [index] : []));

        // The translation's rows beside the recipe's, only when the two lists match one for one.
        const translations = recipe.translations.map((translation) => {
            const stored = storedRows(translation.ingredients);
            const items = stored.map((row, index) => ({ row, index })).filter(({ row }) => sectionHeading(row) === null && row.item.trim() !== '');
            if (items.length !== recipe.ingredients.length || (translation.locale !== 'de' && translation.locale !== 'en')) return { translation, next: stored, moved: false, followed: amountAt.length === 0 };
            const next = [...stored];
            const changedAt = new Set<number>();
            items.forEach(({ row, index }, at) => {
                const change = edit({ rowId: recipe.ingredients[at].id, itemId: recipe.ingredients[at].itemId, name: row.item, amount: row.amount }, translation.locale as RecipeLanguage, 'translation');
                if (change) next[index] = { ...row, item: change.name ?? row.item, amount: change.amount ?? row.amount };
                if (change?.amount !== undefined) changedAt.add(at);
            });
            // Every amount changed in the recipe was changed here too: what was up to date stays so — otherwise it says it is behind.
            const followed = amountAt.every((at) => changedAt.has(at));
            return { translation, next, moved: next.some((row, index) => row.item !== stored[index].item || row.amount !== stored[index].amount), followed };
        });
        if (!moved && !translations.some((entry) => entry.moved)) continue;

        const keyOf = (list: { raw: string; name: string; section: string | null }[], keepCase = false) =>
            sourceKey(
                {
                title: recipe.title,
                description: recipe.description ?? '',
                instructions: recipe.instructions,
                tips: recipe.tips,
                ingredients: withHeadingRows(list.map((row) => ({ amount: row.raw, item: row.name, section: row.section }))),
                },
                keepCase
            );
        const before = keyOf(recipe.ingredients);
        // Stamped as keys were built before names were tidied: up to date all the same.
        const beforeAsTyped = keyOf(recipe.ingredients, true);
        const after = keyOf(rows);
        if (moved && only === undefined) await keepRevisionOf(recipe.id, snapshotOf({ ...recipe, tips: recipe.tips ?? '' }), editedBy);

        await prisma.$transaction([
            ...rows.flatMap((row, index) => {
                const old = recipe.ingredients[index];
                if (row.name === old.name && row.raw === old.raw) return [];
                const parts = row.raw === old.raw ? { quantity: old.quantity, quantityMax: old.quantityMax, unit: old.unit } : splitAmount(row.raw);
                return [prisma.ingredient.update({ where: { id: row.id }, data: { name: row.name, raw: row.raw, quantity: parts.quantity, quantityMax: parts.quantityMax, unit: parts.unit } })];
            }),
            ...translations.flatMap(({ translation, next, moved: rowsMoved, followed }) => {
                const fresh = followed && Boolean(translation.source) && (translation.source === before || translation.source === beforeAsTyped);
                if (!rowsMoved && !(fresh && translation.source !== after)) return [];
                return [
                    prisma.recipeTranslation.update({
                        where: { id: translation.id },
                        data: { ingredients: next as unknown as Prisma.InputJsonValue, ...(fresh ? { source: after } : {}) },
                    }),
                ];
            }),
        ]);
        await prisma.recipe.update({
            where: { id: recipe.id },
            data: recipeColumns({
                ...recipe,
                tips: recipe.tips ?? '',
                ingredients: rows.map((row) => ({ ...row, ...(row.raw === recipe.ingredients.find((old) => old.id === row.id)?.raw ? {} : splitAmount(row.raw)) })),
                translation: await keptTranslation(recipe.id),
            }),
        });
        changed += 1;
    }
    // Rows only — no category moves; the cached filter rail is cleared all the same, as every writer does.
    if (changed > 0) forgetCollectionFacets();
    return changed;
}
