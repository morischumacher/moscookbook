import type { CollectionRow } from './collectionQuery';

/**
 * The same collection as a stranger may see it.
 *
 * A collection is a list of recipes, and publishing the list must not publish
 * what is in it: a private recipe's title and photograph appearing in a search
 * result because somebody made a menu public is exactly the kind of leak
 * nobody would find for months.
 *
 * So for a visitor with no account the tiles are the recipes that are public
 * in their own right, and `hidden` is how many were left out — said rather
 * than silently dropped, because a menu that shows three of eight dishes with
 * no explanation reads as broken.
 *
 * The token page at /c/<token> is deliberately *not* run through this. A
 * secret link is handed to one person on purpose and has always shown the
 * whole menu; the open web is a different audience and gets a different answer.
 */
export function publicOnly(collection: CollectionRow): CollectionRow & { hidden: number } {
    const shown = collection.recipes.filter((recipe) => recipe.isPublic);

    return { ...collection, recipes: shown, hidden: collection.recipes.length - shown.length };
}
