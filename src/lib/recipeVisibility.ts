/**
 * "Nur für mich": a finished recipe only the admins see.
 *
 * Not the household, not a share link, not the web. Every place that shows
 * recipes to somebody filters with these — the list, search, "recipes like
 * this", collections, posts, menus, the shopping list, favourites, the filter
 * chips and the recipe's own page. tests/recipeVisibility.test.ts checks that
 * each of them still does.
 */

/** A Prisma condition: every recipe for an admin, none of the admins' own for anybody else. */
export function visibleTo(viewer: { admin: boolean } | null | undefined): { onlyMe?: false } {
    return viewer?.admin ? {} : { onlyMe: false };
}

export function maysee(recipe: { onlyMe?: boolean | null }, viewer: { admin: boolean } | null | undefined): boolean {
    return !recipe.onlyMe || Boolean(viewer?.admin);
}
