import prisma from './prisma';
import { keyFor, linesFor, mergeInto, removeFrom, type PlannedLine } from './shopping';
import { commonIngredient, ingredientKey } from './ingredientNames';
import { converted, simplified, unitsOf, withoutSource, partsOf, type Part, type Units } from './shoppingParts';
import type { Prisma } from '@prisma/client';
import { linkRecipe, matchItem } from './ingredientCatalog';
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
    buyerId: true,
    itemId: true,
    parts: true,
    item: { select: { de: true, en: true } },
} as const;

export interface ShoppingItemRow {
    id: number;
    name: string;
    measure: string | null;
    amount: number | null;
    aisle: string;
    sources: string[];
    checked: boolean;
    /** Who on the list is buying it; null when nobody said. */
    buyerId: number | null;
    itemId: number | null;
    /** How much is for which recipe (lib/shoppingParts). */
    parts: Prisma.JsonValue;
    /** The catalogue's ingredient, named in both languages; null for a line that is none. */
    item: { de: string; en: string } | null;
}

/** This person's main list, made the first time it is asked for. */
export async function mainListOf(userId: number): Promise<{ id: number }> {
    const found = await prisma.shoppingList.findFirst({ where: { userId, name: null }, select: { id: true } });
    if (found) return found;
    try {
        return await prisma.shoppingList.create({ data: { userId }, select: { id: true } });
    } catch {
        // Made by a request running alongside (the partial unique index in
        // migration 0051 lets only one through): that one is it.
        return prisma.shoppingList.findFirstOrThrow({ where: { userId, name: null }, select: { id: true } });
    }
}

export interface ListAccess {
    id: number;
    /** Whose list it is: the owner also chooses who else is on it, the link, the name. */
    owner: boolean;
    /** Null for somebody's main list. */
    name: string | null;
}

/** Lists this person may work on: their own, and the ones they joined. */
export function reachableBy(userId: number) {
    return { OR: [{ userId }, { members: { some: { userId, acceptedAt: { not: null } } } }] };
}

/**
 * The list a request is about: `requested` (a list id from `?list=`) when it
 * is this person's or one they joined, their main list when nothing is asked
 * for, and null for anything else — a guessed number reads as "not there".
 */
export async function listFor(userId: number, requested: string | null): Promise<ListAccess | null> {
    if (!requested) {
        const main = await mainListOf(userId);
        return { id: main.id, owner: true, name: null };
    }
    if (!/^\d{1,9}$/.test(requested)) return null;
    const list = await prisma.shoppingList.findFirst({
        where: { id: Number(requested), ...reachableBy(userId) },
        select: { id: true, userId: true, name: true },
    });
    return list ? { id: list.id, owner: list.userId === userId, name: list.name } : null;
}

const personName = (person: { firstName: string; name: string }) => person.firstName || person.name;

export interface ListSummary {
    id: number;
    /** Null for a main list. */
    name: string | null;
    owner: boolean;
    /** Whose it is, for a list somebody else shared. */
    ownerName: string | null;
    /** Somebody else is on it, or it has a link. */
    shared: boolean;
    count: number;
}

/**
 * Every list this person can open: their main list, their other lists, then
 * the ones they joined.
 *
 * The main list is made first when there is none yet, so it is always among
 * them. A caller that has just read it (the shopping page, through listFor)
 * passes its id and saves asking the database the same question twice.
 */
export async function listsOf(userId: number, mainId?: number): Promise<ListSummary[]> {
    if (mainId === undefined) await mainListOf(userId);
    const rows = await prisma.shoppingList.findMany({
        where: reachableBy(userId),
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            name: true,
            userId: true,
            shareToken: true,
            user: { select: { firstName: true, name: true } },
            _count: { select: { items: { where: { checked: false } }, members: { where: { acceptedAt: { not: null } } } } },
        },
    });
    const lists = rows.map((row) => ({
        id: row.id,
        name: row.name,
        owner: row.userId === userId,
        ownerName: row.userId === userId ? null : personName(row.user),
        shared: row._count.members > 0 || row.shareToken !== null,
        count: row._count.items,
    }));
    const rank = (list: ListSummary) => (list.owner ? (list.name === null ? 0 : 1) : 2);
    return lists.sort((a, b) => rank(a) - rank(b));
}

/** Who is on a list, and who is invited to. */
export async function householdOf(listId: number) {
    const list = await prisma.shoppingList.findUnique({
        where: { id: listId },
        select: {
            user: { select: { id: true, firstName: true, name: true, avatarUrl: true } },
            members: { orderBy: { createdAt: 'asc' }, select: { acceptedAt: true, user: { select: { id: true, firstName: true, name: true, avatarUrl: true } } } },
        },
    });
    if (!list) return null;
    const person = (user: { id: number; firstName: string; name: string; avatarUrl: string | null }) => ({ id: user.id, name: personName(user), avatarUrl: user.avatarUrl });
    return {
        owner: person(list.user),
        members: list.members.filter((m) => m.acceptedAt).map((m) => person(m.user)),
        invited: list.members.filter((m) => !m.acceptedAt).map((m) => person(m.user)),
    };
}

/** Lists this person was invited to and has not answered. */
export async function invitationsFor(userId: number) {
    const rows = await prisma.shoppingListMember.findMany({
        where: { userId, acceptedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { listId: true, list: { select: { name: true, user: { select: { firstName: true, name: true, avatarUrl: true } } } } },
    });
    return rows.map((row) => ({ listId: row.listId, name: row.list.name, owner: personName(row.list.user), ownerAvatar: row.list.user.avatarUrl }));
}

/**
 * A recipe taken off the list as a whole: its lines go, and a line it shares
 * with another recipe keeps the others' share — exactly, from the parts the
 * line keeps (lib/shoppingParts), also after it was simplified into another
 * unit. A line from before parts were kept keeps its amount: how much was
 * this recipe's is not known, and a little too much beats too little.
 */
export async function removeSource(listId: number, source: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ShoppingList" WHERE id = ${listId} FOR UPDATE`;
        const lines = await tx.shoppingItem.findMany({ where: { listId, sources: { has: source } }, select: { id: true, amount: true, sources: true, parts: true } });
        const gone: number[] = [];
        for (const line of lines) {
            const next = withoutSource(line, source);
            if (next.gone) gone.push(line.id);
            else await tx.shoppingItem.update({ where: { id: line.id }, data: { amount: next.amount, sources: next.sources, parts: next.parts as unknown as Prisma.InputJsonValue } });
        }
        if (gone.length) await tx.shoppingItem.deleteMany({ where: { listId, id: { in: gone } } });
        await tx.shoppingList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
        return lines.length;
    });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const asJson = (parts: Part[]) => parts as unknown as Prisma.InputJsonValue;

/** The units each ingredient is bought in, as far as known without asking anybody. */
export async function knownUnits(client: Pick<Tx, 'ingredientItem'>, itemIds: number[]): Promise<Map<number, { name: string; units: Units | null }>> {
    const items = await client.ingredientItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, de: true, en: true, buyMeasure: true, factors: true } });
    return new Map(items.map((item) => [item.id, { name: item.de || item.en, units: unitsOf(item, commonIngredient(item.de)?.id ?? commonIngredient(item.en)?.id ?? null) }]));
}

export interface SimplifyResult {
    /** Lines that went into another. */
    merged: number;
    /** Ingredients still in several units: how one is in the other is not known. */
    unresolved: { itemId: number; name: string; measures: (string | null)[] }[];
}

/**
 * One ingredient's open lines in different units made one, in the unit it is
 * bought in — for the ingredients in `only`, or all. `unitsFor` says how; it
 * may learn them (the AI, asked once). The parts go along, converted, so a
 * recipe taken off later still takes exactly its share.
 */
export async function simplifyLines(
    tx: Tx,
    listId: number,
    only: number[] | null,
    unitsFor: (itemId: number, measures: (string | null)[], known: Units | null) => Promise<Units | null>
): Promise<SimplifyResult> {
    const lines = await tx.shoppingItem.findMany({
        where: { listId, checked: false, itemId: only ? { in: only } : { not: null } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, itemId: true, measure: true, amount: true, sources: true, parts: true, aisle: true },
    });
    // Per ingredient, and an optional one apart from the one that is needed.
    const groups = new Map<string, typeof lines>();
    for (const line of lines) {
        const id = `${line.itemId}:${line.aisle === 'optional'}`;
        groups.set(id, [...(groups.get(id) ?? []), line]);
    }

    const many = [...groups.values()].filter((group) => new Set(group.map((line) => line.measure)).size > 1).map((group) => [group[0].itemId!, group] as const);
    if (many.length === 0) return { merged: 0, unresolved: [] };
    const known = await knownUnits(tx, many.map(([itemId]) => itemId));

    let merged = 0;
    const unresolved: SimplifyResult['unresolved'] = [];
    for (const [itemId, group] of many) {
        const measures = [...new Set(group.map((line) => line.measure))];
        const units = await unitsFor(itemId, measures, known.get(itemId)?.units ?? null);
        const plan = units ? simplified(group.map((line) => ({ ...line, parts: partsOf(line) })), units) : null;
        if (!plan) {
            unresolved.push({ itemId, name: known.get(itemId)?.name ?? '', measures });
            continue;
        }
        await tx.shoppingItem.update({ where: { id: plan.keep }, data: { measure: plan.measure, amount: plan.amount, sources: plan.sources, parts: asJson(plan.parts) } });
        await tx.shoppingItem.deleteMany({ where: { listId, id: { in: plan.drop } } });
        merged += plan.drop.length;
    }
    return { merged, unresolved };
}

export async function itemsOf(listId: number): Promise<ShoppingItemRow[]> {
    return prisma.shoppingItem.findMany({
        where: { listId },
        // In the order they came: a ticked line keeps its place (work #38).
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: shoppingItemSelect,
    });
}

/** New lines onto a list, merged with what is already there. Returns how many lines changed. */
/**
 * What a line merges on: the catalogue's ingredient when its name is one
 * (lib/ingredientCatalog) — so "Frühlingszwiebeln" and "green onions" meet,
 * from any recipe in either language — else its folded name.
 */
function catalogKeys() {
    const known = new Map<string, Promise<number | null>>();
    return async (name: string, itemId: number | null = null) => {
        if (itemId === null) {
            if (!known.has(name)) known.set(name, matchItem(name).catch(() => null));
            itemId = await known.get(name)!;
        }
        return { itemId, key: itemId !== null ? `item:${itemId}` : ingredientKey(name) };
    };
}

/** A line with its catalogue key — kept apart when it is optional. */
const withKey = <L extends { aisle: string }>(line: L, found: { itemId: number | null; key: string }) => ({ ...line, itemId: found.itemId, key: keyFor(found.key, line.aisle) });

export async function addLines(listId: number, planned: PlannedLine[]): Promise<number> {
    if (planned.length === 0) return 0;
    const keyOf = catalogKeys();
    const resolved = await Promise.all(planned.map(async (line) => withKey(line, await keyOf(line.name))));

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
            select: { id: true, key: true, name: true, itemId: true, measure: true, amount: true, sources: true, checked: true, parts: true, aisle: true },
        });

        // Lines made before the catalogue meet the new ones by the name they show.
        const current = await Promise.all(existing.map(async (row) => withKey(row, await keyOf(row.name, row.itemId))));
        const plan = mergeInto(current, resolved);

        for (const update of plan.updates) {
            await tx.shoppingItem.update({
                where: { id: update.id },
                data: { measure: update.measure ?? null, amount: update.amount, sources: update.sources, parts: asJson(update.parts) },
            });
        }
        await tx.shoppingItem.createMany({
            data: plan.creates.map((line) => ({
                listId,
                name: line.name,
                key: line.key,
                itemId: (line as { itemId?: number | null }).itemId ?? null,
                measure: line.measure,
                amount: line.amount,
                aisle: line.aisle,
                sources: line.sources,
                parts: asJson(line.parts),
            })),
        });

        // The same ingredient now in two units — "2 Bund" and "7" spring
        // onions: made one where it is known how, without asking anybody.
        const items = [...new Set(resolved.map((line) => line.itemId).filter((id): id is number => id !== null))];
        if (items.length) await simplifyLines(tx, listId, items, async (_, __, units) => units);
        await tx.shoppingList.update({ where: { id: listId }, data: { updatedAt: new Date() } });

        return plan.updates.length + plan.creates.length;
    });
}

/**
 * Lines to take off, in the unit the list now has them in: added as "7
 * Frühlingszwiebeln" and since made "1 Bund" (by the simplifying), they are
 * taken off as 1 Bund.
 */
async function inListUnits<L extends PlannedLine & { key: string; itemId: number | null }>(
    tx: Tx,
    current: { key: string; measure: string | null }[],
    lines: L[]
): Promise<L[]> {
    const there = new Set(current.map((line) => `${line.key}\u0000${line.measure ?? ''}`));
    const moved = lines.filter((line) => line.itemId !== null && !there.has(`${line.key}\u0000${line.measure ?? ''}`));
    if (moved.length === 0) return lines;
    const units = await knownUnits(tx, [...new Set(moved.map((line) => line.itemId!))]);
    return lines.map((line) => {
        if (!moved.includes(line)) return line;
        const own = units.get(line.itemId!)?.units;
        if (!own || !there.has(`${line.key}\u0000${own.buy}`)) return line;
        const next = converted({ measure: line.measure, amount: line.amount, parts: [] }, own);
        return next ? { ...line, measure: next.measure, amount: next.amount } : line;
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
            select: { id: true, key: true, name: true, itemId: true, measure: true, amount: true, sources: true, checked: true, parts: true, aisle: true },
        });
        const keyOf = catalogKeys();
        const current = await Promise.all(existing.map(async (row) => withKey(row, await keyOf(row.name, row.itemId))));
        const resolved = await Promise.all(planned.map(async (line) => withKey(line, await keyOf(line.name))));
        const wanted = await inListUnits(tx, current, resolved);
        const plan = removeFrom(current, wanted);
        for (const update of plan.updates) {
            await tx.shoppingItem.update({ where: { id: update.id }, data: { amount: update.amount, sources: update.sources, parts: asJson(update.parts) } });
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
    // A recipe from before the catalogue, or written past it: its rows are
    // pointed at their ingredients now, so its lines merge with the others.
    if (await prisma.ingredient.count({ where: { recipeId, itemId: null } })) await linkRecipe(recipeId).catch(() => 0);

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
    // `source` too: without it a stale translation never looked stale here.
    translations: { select: { locale: true, title: true, description: true, instructions: true, ingredients: true, source: true } },
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


/**
 * Before an account goes: every list somebody else shops on passes to the
 * person who joined it first, rather than going with the account (the rows
 * cascade) and taking the household's weekly list with it. A main list
 * becomes a named one, since its new owner has a main list of their own.
 */
export async function handOverLists(tx: Tx, userId: number): Promise<void> {
    const lists = await tx.shoppingList.findMany({
        where: { userId, members: { some: { acceptedAt: { not: null } } } },
        select: {
            id: true,
            name: true,
            members: { where: { acceptedAt: { not: null } }, orderBy: { acceptedAt: 'asc' }, take: 1, select: { userId: true } },
        },
    });
    for (const list of lists) {
        const heir = list.members[0]?.userId;
        if (!heir) continue;
        await tx.shoppingListMember.delete({ where: { listId_userId: { listId: list.id, userId: heir } } });
        await tx.shoppingList.update({ where: { id: list.id }, data: { userId: heir, name: list.name ?? 'Gemeinsame Liste' } });
    }
}
