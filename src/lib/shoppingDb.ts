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
            user: { select: { id: true, firstName: true, name: true } },
            members: { orderBy: { createdAt: 'asc' }, select: { acceptedAt: true, user: { select: { id: true, firstName: true, name: true } } } },
        },
    });
    if (!list) return null;
    return {
        owner: { id: list.user.id, name: personName(list.user) },
        members: list.members.filter((m) => m.acceptedAt).map((m) => ({ id: m.user.id, name: personName(m.user) })),
        invited: list.members.filter((m) => !m.acceptedAt).map((m) => ({ id: m.user.id, name: personName(m.user) })),
    };
}

/** Lists this person was invited to and has not answered. */
export async function invitationsFor(userId: number) {
    const rows = await prisma.shoppingListMember.findMany({
        where: { userId, acceptedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { listId: true, list: { select: { name: true, user: { select: { firstName: true, name: true } } } } },
    });
    return rows.map((row) => ({ listId: row.listId, name: row.list.name, owner: personName(row.list.user) }));
}

/**
 * A recipe taken off the list as a whole: its lines go, and a line it shares
 * with another recipe stays for that one. The shared line keeps its amount —
 * how much of it was this recipe's is not kept once merged, and a little too
 * much in the trolley is better than too little.
 */
export async function removeSource(listId: number, source: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ShoppingList" WHERE id = ${listId} FOR UPDATE`;
        const lines = await tx.shoppingItem.findMany({ where: { listId, sources: { has: source } }, select: { id: true, sources: true } });
        for (const line of lines) {
            const rest = line.sources.filter((s) => s !== source);
            if (rest.length === 0) await tx.shoppingItem.delete({ where: { id: line.id } });
            else await tx.shoppingItem.update({ where: { id: line.id }, data: { sources: rest } });
        }
        await tx.shoppingList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
        return lines.length;
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

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
