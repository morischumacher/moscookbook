import prisma from './prisma';

/**
 * What an entry is about: which recipes and collections, and whether it may
 * be about them.
 *
 * No post about a draft. That is the line drawn between "it is in the queue"
 * and "it is a post", and it is also a leak: a post can be shared at
 * /p/<token>, which needs no account, and it names the recipes it is about.
 * So a post about a draft would be a draft with a public address by another
 * route. The update route never checked this; with the links in one place,
 * both do.
 */
export async function refusedLinks(recipeIds: number[], collectionIds: number[]): Promise<string | null> {
    const [recipes, collections] = await Promise.all([
        recipeIds.length > 0
            ? prisma.recipe.findMany({ where: { id: { in: recipeIds } }, select: { id: true, isDraft: true } })
            : [],
        collectionIds.length > 0
            ? prisma.collection.count({ where: { id: { in: collectionIds } } })
            : 0,
    ]);

    if (recipes.some((recipe) => recipe.isDraft)) {
        return 'A post cannot be written about a draft. Finish the recipe first.';
    }
    if (recipes.length !== new Set(recipeIds).size) return 'That recipe no longer exists.';
    if (collections !== new Set(collectionIds).size) return 'That collection no longer exists.';

    return null;
}

/** The nested writes for a new entry's links, each list in the order given. */
export function linkCreates(recipeIds: number[], collectionIds: number[]) {
    const unique = (ids: number[]) => [...new Set(ids)];
    return {
        recipes: { create: unique(recipeIds).map((recipeId, position) => ({ recipeId, position })) },
        collections: {
            create: unique(collectionIds).map((collectionId, position) => ({ collectionId, position })),
        },
    };
}

/** The same, replacing whatever an existing entry had. */
export function linkReplacements(recipeIds: number[], collectionIds: number[]) {
    const created = linkCreates(recipeIds, collectionIds);
    return {
        recipes: { deleteMany: {}, create: created.recipes.create },
        collections: { deleteMany: {}, create: created.collections.create },
    };
}
