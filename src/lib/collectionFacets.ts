import { unstable_cache, revalidateTag } from 'next/cache';
import prisma from '@/lib/prisma';
import { QUICK_MINUTES } from '@/lib/tags';

/**
 * What the collection as a whole looks like: which categories and cuisines
 * exist, how many recipes are in each, and how many there are altogether.
 *
 * This is the front page's most expensive answer and its least changeable one.
 * Three queries ran on *every* render — two `groupBy`s and a `count` — and the
 * two `groupBy`s have no `where` at all, so they read the entire table whether
 * or not anybody filtered anything. An index does not save them: a group-by
 * over a whole table is a sequential scan followed by a hash, and Postgres will
 * pick that over an index every time. It was measured rather than assumed, on
 * five thousand rows.
 *
 * What does save them is not asking. The answer changes when a recipe is added,
 * removed or recategorised, which happens a few times a week — so it is
 * computed once, kept, and thrown away by the writers themselves through
 * `revalidateTag`. An hour is the backstop for a tag that somehow never fires,
 * not the mechanism.
 *
 * The rule that keeps it honest: every place that writes a recipe must call
 * `forgetCollectionFacets()`. Forgetting is silent — the site is correct in
 * every way except that a new category does not appear in the filter rail — so
 * `npm run check:search` checks for the call in the same walk that checks the
 * search columns, which fail the same silent way.
 */

const RECIPE_COLLECTION_TAG = 'recipe-collection';

export interface CollectionFacets {
    categories: { value: string; count: number }[];
    cuisines: { value: string; count: number }[];
    /** Every tag in use, busiest first — the diet tags among them. */
    tags: { value: string; count: number }[];
    /** How many finished recipes take half an hour or less. */
    quick: number;
    /** Every recipe, regardless of filter — what "all recipes" counts. */
    total: number;
}

interface Group {
    category?: string | null;
    nationality?: string | null;
    _count: { _all: number };
}

async function readFacets(): Promise<CollectionFacets> {
    const [categoryGroups, cuisineGroups, total, tagRows, quickRows] = await Promise.all([
        // Drafts are not in the list the chips filter, so counting them would
        // promise results a click cannot deliver — a category chip reading "3"
        // that opens onto two recipes.
        prisma.recipe.groupBy({ by: ['category'], where: { isDraft: false }, _count: { _all: true } }),
        prisma.recipe.groupBy({ by: ['nationality'], where: { isDraft: false }, _count: { _all: true } }),
        prisma.recipe.count({ where: { isDraft: false } }),
        prisma.$queryRaw<{ value: string; count: bigint }[]>`
            SELECT tag AS value, count(*)::bigint AS count
            FROM "Recipe", unnest("tags") AS tag
            WHERE "isDraft" = false
            GROUP BY tag
            ORDER BY count DESC, tag ASC
            LIMIT 40
        `,
        prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*)::bigint AS count FROM "Recipe"
            WHERE "isDraft" = false
              AND COALESCE("prepMinutes", 0) + COALESCE("cookMinutes", 0) BETWEEN 1 AND ${QUICK_MINUTES}
        `,
    ]);

    // Shaped here rather than at the call site, so what is kept in the cache is
    // what the chips render — busiest first, blanks dropped.
    const named = (groups: Group[], key: 'category' | 'nationality') =>
        groups
            .map((group) => ({ value: (group[key] ?? '').trim(), count: group._count._all }))
            .filter((entry) => entry.value !== '')
            .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    return {
        categories: named(categoryGroups, 'category'),
        cuisines: named(cuisineGroups, 'nationality'),
        tags: tagRows.map((row) => ({ value: row.value, count: Number(row.count) })),
        quick: Number(quickRows[0]?.count ?? 0),
        total,
    };
}

export const collectionFacets = unstable_cache(readFacets, ['collection-facets'], {
    tags: [RECIPE_COLLECTION_TAG],
    revalidate: 3600,
});

/**
 * Called by every writer that adds, removes or changes a recipe.
 *
 * Never allowed to throw: a filter rail that is an edit behind is a smaller
 * problem than a save that fails because the cache could not be cleared.
 */
export function forgetCollectionFacets(): void {
    try {
        // Next 16 asks for a cache-life profile alongside the tag. `max` means
        // "forget it now and do not keep serving the old one", which is the
        // whole point of calling this from a writer.
        revalidateTag(RECIPE_COLLECTION_TAG, 'max');
    } catch {
        // Outside a request — a script, a test — there is nothing to clear.
    }
}
