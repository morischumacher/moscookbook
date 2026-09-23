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

export interface ListAccess {
    id: number;
    /** Whose list it is: the owner also chooses who else is on it, and the link. */
    owner: boolean;
}

/**
 * The list this person shops on: the one they joined, or else their own.
 *
 * One list per household rather than several side by side — "which list am
 * I adding to?" is then never a question.
 */
export async function activeList(userId: number): Promise<ListAccess> {
    const joined = await prisma.shoppingListMember.findFirst({
        where: { userId, acceptedAt: { not: null } },
        select: { listId: true },
    });
    if (joined) return { id: joined.listId, owner: false };
    const own = await listOf(userId);
    return { id: own.id, owner: true };
}

const personName = (person: { firstName: string; name: string }) => person.firstName || person.name;

/** Who shops on a list, and who is invited to. */
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
        select: { listId: true, list: { select: { user: { select: { firstName: true, name: true } } } } },
    });
    return rows.map((row) => ({ listId: row.listId, owner: personName(row.list.user) }));
}

export type JoinOutcome = 'joined' | 'notInvited' | 'alreadyJoined' | 'hosting';

/**
 * Accepting an invitation: from now on this person shops on that list. What
 * was on their own list moves across with them, so nothing they meant to buy
 * disappears; their own list is empty until they leave again.
 */
export async function joinList(userId: number, listId: number): Promise<JoinOutcome> {
    return prisma.$transaction(async (tx) => {
        const invitation = await tx.shoppingListMember.findUnique({
            where: { listId_userId: { listId, userId } },
            select: { acceptedAt: true },
        });
        if (!invitation) return 'notInvited';
        if (await tx.shoppingListMember.findFirst({ where: { userId, acceptedAt: { not: null } }, select: { listId: true } })) {
            return 'alreadyJoined';
        }

        const own = await tx.shoppingList.findUnique({ where: { userId }, select: { id: true } });
        if (own) {
            // Somebody who already shares their own list would leave the
            // others on a list nobody else uses.
            if (await tx.shoppingListMember.count({ where: { listId: own.id, acceptedAt: { not: null } } })) return 'hosting';
            await tx.shoppingListMember.deleteMany({ where: { listId: own.id } });
            await tx.$queryRaw`SELECT id FROM "ShoppingList" WHERE id = ${listId} FOR UPDATE`;
            await tx.shoppingItem.updateMany({ where: { listId: own.id }, data: { listId } });
        }
        await tx.shoppingListMember.update({ where: { listId_userId: { listId, userId } }, data: { acceptedAt: new Date() } });
        return 'joined';
    });
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
