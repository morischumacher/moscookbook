import prisma from './prisma';
import { linesFor, mergeInto, removeFrom, type PlannedLine } from './shopping';
import { inLanguage } from './recipeTranslation';
import { visibleTo } from './recipeVisibility';

/**
 * The shopping list's storage. The thinking is in lib/shopping.ts; this only
 * reads and writes it.
 */

export const shoppingItemSelect = {
    id: true,
    name: true,
    measure: true,
    amount: true,
    aisle: true,
    sources: true,
    checked: true,
} as const;

export interface ShoppingItemRow {
    id: number;
    name: string;
    measure: string | null;
    amount: number | null;
    aisle: string;
    sources: string[];
    checked: boolean;
}

/** This person's list, made the first time it is asked for. */
export async function listOf(userId: number) {
    return prisma.shoppingList.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: { id: true, shareToken: true },
    });
}

export async function itemsOf(listId: number): Promise<ShoppingItemRow[]> {
    return prisma.shoppingItem.findMany({
        where: { listId },
        orderBy: [{ checked: 'asc' }, { createdAt: 'asc' }],
        select: shoppingItemSelect,
    });
}

/** New lines onto a list, merged with what is already there. Returns how many lines changed. */
export async function addLines(listId: number, planned: PlannedLine[]): Promise<number> {
    if (planned.length === 0) return 0;

    /*
     * Read and write under one lock on the list. The merge adds to what it
     * read, and writes the sum: two adds at once (two recipes tapped quickly,
     * or the owner and somebody on the shared link) both read "Zwiebel 2"
     * and one of them was lost.
     */
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ShoppingList" WHERE id = ${listId} FOR UPDATE`;

        const existing = await tx.shoppingItem.findMany({
            where: { listId, checked: false },
            select: { id: true, key: true, measure: true, amount: true, sources: true, checked: true },
        });

        const plan = mergeInto(existing, planned);

        for (const update of plan.updates) {
            await tx.shoppingItem.update({
                where: { id: update.id },
                data: { amount: update.amount, sources: update.sources },
            });
        }
        await tx.shoppingItem.createMany({
            data: plan.creates.map((line) => ({
                listId,
                name: line.name,
                key: line.key,
                measure: line.measure,
                amount: line.amount,
                aisle: line.aisle,
                sources: line.sources,
            })),
        });
        await tx.shoppingList.update({ where: { id: listId }, data: { updatedAt: new Date() } });

        return plan.updates.length + plan.creates.length;
    });
}

/** The same lines taken off the list again. Returns how many lines changed. */
export async function removeLines(listId: number, planned: PlannedLine[]): Promise<number> {
    if (planned.length === 0) return 0;
    // Under the same lock as addLines, for the same reason.
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ShoppingList" WHERE id = ${listId} FOR UPDATE`;
        const existing = await tx.shoppingItem.findMany({
            where: { listId, checked: false },
            select: { id: true, key: true, measure: true, amount: true, sources: true, checked: true },
        });
        const plan = removeFrom(existing, planned);
        for (const update of plan.updates) {
            await tx.shoppingItem.update({ where: { id: update.id }, data: { amount: update.amount, sources: update.sources } });
        }
        await tx.shoppingItem.deleteMany({ where: { id: { in: plan.deletes }, listId } });
        return plan.updates.length + plan.deletes.length;
    });
}

/**
 * A recipe's lines at the servings it was being read at. `servings` is what
 * the stepper on the recipe page showed; the recipe's own number is what its
 * amounts are written for.
 */
export async function recipeLines(
    recipeId: number,
    servings: number | null,
    locale?: string,
    viewer?: { admin: boolean } | null
): Promise<PlannedLine[] | null> {
    const recipe = await prisma.recipe.findFirst({
        // An "only me" recipe is not there for anybody else (lib/recipeVisibility).
        where: { id: recipeId, ...visibleTo(viewer) },
        select: recipeForList,
    });
    if (!recipe) return null;

    const factor = servings && recipe.servings ? servings / recipe.servings : 1;
    const shown = asRead(recipe, locale);
    return linesFor(shown.ingredients, factor, shown.title);
}

/*
 * What the list needs of a recipe — and its translation, so what is added is
 * what the reader saw: "250 g Mehl" on the German page, not "2 cups flour".
 */
const recipeForList = {
    title: true,
    servings: true,
    description: true,
    instructions: true,
    language: true,
    ingredients: { orderBy: { position: 'asc' as const }, select: { name: true, quantity: true, quantityMax: true, unit: true, raw: true, section: true } },
    translations: { select: { locale: true, title: true, description: true, instructions: true, ingredients: true } },
};

function asRead<T extends Parameters<typeof inLanguage>[0]>(recipe: T, locale: string | undefined) {
    return locale ? inLanguage(recipe, locale) : recipe;
}

/** Every finished recipe in a collection, each at its own servings. */
export async function collectionLines(collectionId: number, locale?: string): Promise<PlannedLine[] | null> {
    const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        select: {
            recipes: {
                where: { recipe: { isDraft: false, onlyMe: false } },
                orderBy: { position: 'asc' },
                select: { recipe: { select: recipeForList } },
            },
        },
    });
    if (!collection) return null;

    return collection.recipes.flatMap((row) => {
        const shown = asRead(row.recipe, locale);
        return linesFor(shown.ingredients, 1, shown.title);
    });
}
