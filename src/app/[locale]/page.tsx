import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import FilterChips, { type FacetValue } from '@/components/home/FilterChips';
import RecipeCard from '@/components/RecipeCard';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { buildTsQuery } from '@/lib/searchText';
import { parseIngredientQuery, variantsOf } from '@/lib/ingredientSearch';

interface RecipeListRow {
    id: number;
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    nationality: string | null;
    views: number;
    createdAt: Date;
    images: { url: string }[];
    ratings: { value: number }[];
}

/** One "this recipe has an ingredient like X" clause. */
interface HasIngredient {
    ingredients: {
        some: {
            OR: { name: { contains: string; mode: 'insensitive' } }[];
        };
    };
}

interface RecipeWhere {
    category?: string;
    nationality?: string;
    id?: { in: number[] };
    /** One entry per ingredient somebody said they have: all of them must match. */
    AND?: HasIngredient[];
}

type RecipeOrderBy = { createdAt: 'desc' } | { views: 'desc' };

/** One screenful. The page never loads the whole collection. */
const PAGE_SIZE = 24;

interface FacetGroup {
    category?: string | null;
    nationality?: string | null;
    _count: { _all: number };
}

function averageRating(ratings: { value: number }[]): number {
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, rating) => sum + rating.value, 0) / ratings.length;
}

/** Turns a Prisma groupBy result into chip data, busiest first. */
function toFacets(groups: FacetGroup[], key: 'category' | 'nationality'): FacetValue[] {
    return groups
        .map((group) => ({ value: (group[key] ?? '').trim(), count: group._count._all }))
        .filter((facet) => facet.value !== '')
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export default async function HomePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
    params: Promise<{ locale: string }>;
}) {
    const t = await getTranslations('Home');
    const tSite = await getTranslations('Site');
    const tBlog = await getTranslations('Blog');

    const {
        sort: sortParam,
        category: categoryParam,
        nationality: nationalityParam,
        favorites,
        search: searchParam,
        have: haveParam,
        page: pageParam,
    } = await searchParams;

    const sort = typeof sortParam === 'string' ? sortParam : 'recent';
    const category = typeof categoryParam === 'string' ? categoryParam : '';
    const nationality = typeof nationalityParam === 'string' ? nationalityParam : '';
    const search = typeof searchParam === 'string' ? searchParam : '';
    const have = typeof haveParam === 'string' ? haveParam : '';
    const showFavorites = favorites === 'true';

    const user = await getCurrentUser();
    const isLoggedIn = user !== null;

    // One lookup of the viewer's favourites powers both the "favourites only"
    // filter and the filled-in heart on each card.
    const favoriteRecipeIds = user
        ? new Set<number>(
            (
                await prisma.favorite.findMany({
                    where: { userId: user.id },
                    select: { recipeId: true },
                })
            ).map((favorite: { recipeId: number }) => favorite.recipeId)
        )
        : new Set<number>();

    const where: RecipeWhere = {};
    if (category) where.category = category;
    if (nationality) where.nationality = nationality;

    if (showFavorites && isLoggedIn) {
        where.id = { in: [...favoriteRecipeIds] };
    }

    /**
     * Relevance order for the current search, most relevant first.
     *
     * The ranking has to come from Postgres — it is the only thing that knows
     * how the German stemmer folded each word — so this is one raw query, and
     * everything afterwards works on ids like the rating sort does. That means
     * loading the ids of every hit rather than one page of them; for a personal
     * cookbook the list is short, and paying that to keep all the filtering in
     * one place is the right trade.
     */
    /**
     * "What can I make with what is in the house."
     *
     * Every named ingredient has to be present, not any of them: the question
     * is whether a recipe can be cooked tonight, and "you have half of it" is
     * not an answer. That makes it one `AND` per word rather than a ranked
     * query — and it runs against the structured Ingredient rows, whose `name`
     * column is indexed and already has the quantity stripped off.
     */
    const wanted = parseIngredientQuery(have);

    if (wanted.length > 0) {
        where.AND = wanted.map((word) => ({
            ingredients: {
                some: {
                    // One word, several spellings: what was typed, its singular,
                    // and the ae/oe/ue form. `contains` does the rest, so
                    // "zwiebel" finds "rote Zwiebeln".
                    OR: variantsOf(word).map((form) => ({
                        name: { contains: form, mode: 'insensitive' as const },
                    })),
                },
            },
        }));
    }

    let rankById: Map<number, number> | null = null;

    if (search) {
        const tsquery = buildTsQuery(search);

        if (tsquery !== null) {
            // Annotated as well as parameterised: $queryRaw takes its type
            // argument explicitly, so unlike groupBy nothing is inferred
            // backwards from the assignment, and the annotation still holds
            // when the generated client is absent.
            const ranked: { id: number }[] = await prisma.$queryRaw<{ id: number }[]>`
                SELECT "id"
                FROM "Recipe"
                WHERE "searchVector" @@ to_tsquery('german', ${tsquery})
                ORDER BY ts_rank("searchVector", to_tsquery('german', ${tsquery})) DESC,
                         "createdAt" DESC
            `;

            const matchedIds = ranked.map((row) => row.id);
            rankById = new Map(matchedIds.map((id, index) => [id, index]));

            // Favourites may already have narrowed this; a search on top of it
            // narrows further rather than replacing it.
            where.id = where.id
                ? { in: where.id.in.filter((id) => rankById?.has(id)) }
                : { in: matchedIds };
        }
    }

    // A search sorts by relevance unless the visitor picked a different order
    // themselves. `sortParam` is read before defaulting precisely so that
    // "nothing chosen" can be told apart from "chose newest".
    const sortByRelevance = rankById !== null && sortParam === undefined;

    const orderBy: RecipeOrderBy = sort === 'views' ? { views: 'desc' } : { createdAt: 'desc' };

    const requestedPage = Number.parseInt(typeof pageParam === 'string' ? pageParam : '1', 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const skip = (page - 1) * PAGE_SIZE;

    const include = { images: { orderBy: { position: 'asc' as const } }, ratings: true };

    // The chips describe the whole collection rather than the current result,
    // because a chip that leads to an empty page is worse than no chip.
    const [total, categoryGroups, cuisineGroups, collectionSize] = await Promise.all([
        prisma.recipe.count({ where }),
        prisma.recipe.groupBy({ by: ['category'], _count: { _all: true } }),
        prisma.recipe.groupBy({ by: ['nationality'], _count: { _all: true } }),
        prisma.recipe.count(),
    ]);

    /**
     * Reads one page of recipes in an order the database cannot produce itself.
     *
     * Both the rating sort and the relevance sort rank ids in memory and then
     * need the rows back in that order — which `IN (…)` does not promise — so
     * the ordering is reapplied after the fetch.
     */
    async function pageOf(orderedIds: number[]): Promise<RecipeListRow[]> {
        const pageIds = orderedIds.slice(skip, skip + PAGE_SIZE);
        if (pageIds.length === 0) return [];

        const unordered: RecipeListRow[] = await prisma.recipe.findMany({
            where: { id: { in: pageIds } },
            include,
        });

        return pageIds
            .map((id) => unordered.find((recipe) => recipe.id === id))
            .filter((recipe): recipe is RecipeListRow => recipe !== undefined);
    }

    let recipes: RecipeListRow[];

    if (sortByRelevance && rankById) {
        // The filters may have removed some hits, so the ids are re-read
        // through `where` and then put back into the ranking's order.
        const matching: { id: number }[] = await prisma.recipe.findMany({
            where,
            select: { id: true },
        });

        recipes = await pageOf(
            matching
                .map((row) => row.id)
                .sort((a, b) => (rankById.get(a) ?? 0) - (rankById.get(b) ?? 0))
        );
    } else if (sort === 'rating') {
        // Prisma cannot order by an average across a relation. Rather than
        // loading every recipe and sorting in memory, fetch only the ids that
        // match, rank them against a single aggregate query, then read the one
        // page that is actually shown.
        const matching: { id: number }[] = await prisma.recipe.findMany({
            where,
            select: { id: true },
        });
        const matchingIds = matching.map((row) => row.id);

        // Deliberately not annotated: Prisma infers groupBy's argument type
        // from the expected result, so an explicit annotation here breaks the
        // inference rather than documenting it.
        const averageById = new Map<number, number>();

        if (matchingIds.length > 0) {
            const averages = await prisma.rating.groupBy({
                by: ['recipeId'],
                where: { recipeId: { in: matchingIds } },
                _avg: { value: true },
            });

            for (const entry of averages) {
                averageById.set(entry.recipeId, entry._avg.value ?? 0);
            }
        }

        recipes = await pageOf(
            matchingIds.sort(
                (a, b) => (averageById.get(b) ?? 0) - (averageById.get(a) ?? 0) || b - a
            )
        );
    } else {
        recipes = await prisma.recipe.findMany({ where, orderBy, skip, take: PAGE_SIZE, include });
    }

    // Entries are not mixed into the grid — a blog post is not a recipe and a
    // tile is not what it looks like. But somebody who searched here should not
    // have to know that the answer might be one page over, so a search that
    // also matches writing says so.
    let matchingPosts = 0;

    if (search) {
        const tsquery = buildTsQuery(search);

        if (tsquery !== null) {
            const hits: { count: bigint }[] = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT count(*)::bigint AS count
                FROM "Post"
                WHERE "publishedAt" IS NOT NULL
                  AND "searchVector" @@ to_tsquery('german', ${tsquery})
            `;
            matchingPosts = Number(hits[0]?.count ?? 0);
        }
    }

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    /** Paging must not drop the filters the visitor set. */
    const pageHref = (target: number) => {
        const params = new URLSearchParams();
        if (sort !== 'recent') params.set('sort', sort);
        if (category) params.set('category', category);
        if (nationality) params.set('nationality', nationality);
        if (search) params.set('search', search);
        if (have) params.set('have', have);
        if (showFavorites) params.set('favorites', 'true');
        if (target > 1) params.set('page', String(target));
        const query = params.toString();
        return query ? `/?${query}` : '/';
    };

    const formattedRecipes = recipes.map((recipe) => ({
        ...recipe,
        description: recipe.description ?? '',
        category: recipe.category ?? '',
        nationality: recipe.nationality ?? '',
        imageUrl: recipe.images[0]?.url ?? '',
        rating: averageRating(recipe.ratings),
        isFavorited: favoriteRecipeIds.has(recipe.id),
        isLoggedIn,
    }));

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 md:px-8">
            {/*
                The navigation already says what this place is called, in the
                same words, forty pixels higher up. Saying it again in 48px was
                the whole first screen of a phone spent on the name of the site
                the person is already looking at — so the heading is now what
                the page is *about*, and the recipes start where the second
                "mo'scookbook" used to be.
            */}
            <header className="pb-6 pt-10 sm:pt-14">
                <h1 className="font-serif text-2xl italic leading-snug text-ink sm:text-3xl">
                    {tSite('description')}
                </h1>
            </header>

            <div className="pb-6">
                <Suspense fallback={<div className="h-24" aria-hidden="true" />}>
                    <FilterChips
                        categories={toFacets(categoryGroups, 'category')}
                        cuisines={toFacets(cuisineGroups, 'nationality')}
                        isLoggedIn={isLoggedIn}
                        total={collectionSize}
                    />
                </Suspense>
            </div>

            {formattedRecipes.length > 0 ? (
                <>
                    <p className="border-t border-line pt-4 text-xs uppercase tracking-widest text-faint">
                        {t('resultCount', { count: total })}
                    </p>

                    {matchingPosts > 0 && (
                        <p className="mt-3 text-sm text-muted">
                            <Link
                                href={`/blog?search=${encodeURIComponent(search)}`}
                                className="underline underline-offset-4"
                            >
                                {tBlog('alsoInBlog', { count: matchingPosts })}
                            </Link>
                        </p>
                    )}
                    {/*
                        Two columns on a phone, three once there is room. Not
                        four: a tile that small stops being a photograph and
                        becomes a swatch.
                    */}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                        {formattedRecipes.map((recipe) => (
                            <RecipeCard key={recipe.id} {...recipe} />
                        ))}
                    </div>

                    {pageCount > 1 && (
                        <nav
                            className="flex items-center justify-between border-t border-line pt-6 text-sm"
                            aria-label={t('pagination')}
                        >
                            {page > 1 ? (
                                <Link
                                    href={pageHref(page - 1)}
                                    rel="prev"
                                    className="underline underline-offset-4 hover:text-muted"
                                >
                                    {t('previousPage')}
                                </Link>
                            ) : (
                                <span />
                            )}

                            <span className="text-faint">
                                {t('pageOf', { page, pages: pageCount })}
                            </span>

                            {page < pageCount ? (
                                <Link
                                    href={pageHref(page + 1)}
                                    rel="next"
                                    className="underline underline-offset-4 hover:text-muted"
                                >
                                    {t('nextPage')}
                                </Link>
                            ) : (
                                <span />
                            )}
                        </nav>
                    )}
                </>
            ) : (
                <div className="border-t border-line py-20 text-center">
                    <p className="text-muted">{t('noResults')}</p>
                </div>
            )}
        </main>
    );
}
