import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import FilterChips, { type FacetValue } from '@/components/home/FilterChips';
import RecipeCard from '@/components/RecipeCard';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { buildTsQuery } from '@/lib/searchText';

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

interface RecipeWhere {
    category?: string;
    nationality?: string;
    id?: { in: number[] };
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

    const {
        sort: sortParam,
        category: categoryParam,
        nationality: nationalityParam,
        favorites,
        search: searchParam,
        page: pageParam,
    } = await searchParams;

    const sort = typeof sortParam === 'string' ? sortParam : 'recent';
    const category = typeof categoryParam === 'string' ? categoryParam : '';
    const nationality = typeof nationalityParam === 'string' ? nationalityParam : '';
    const search = typeof searchParam === 'string' ? searchParam : '';
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

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    /** Paging must not drop the filters the visitor set. */
    const pageHref = (target: number) => {
        const params = new URLSearchParams();
        if (sort !== 'recent') params.set('sort', sort);
        if (category) params.set('category', category);
        if (nationality) params.set('nationality', nationality);
        if (search) params.set('search', search);
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
            <header className="border-b border-line pb-8 pt-12 sm:pt-16">
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{tSite('title')}</h1>
                <p className="mt-3 font-serif text-lg italic text-muted sm:text-xl">
                    {tSite('description')}
                </p>
            </header>

            <div className="py-6">
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
                    <div className="flex flex-col divide-y divide-line">
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
