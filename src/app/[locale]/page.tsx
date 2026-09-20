import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import FilterChips, { type FacetValue } from '@/components/home/FilterChips';
import RecipeCard from '@/components/RecipeCard';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

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

type TextFilter = { contains: string; mode: 'insensitive' };

interface RecipeWhere {
    category?: string;
    nationality?: string;
    id?: { in: number[] };
    OR?: Array<{ title?: TextFilter; description?: TextFilter }>;
}

type RecipeOrderBy = { createdAt: 'desc' } | { views: 'desc' };

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

    if (search) {
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
        ];
    }

    if (showFavorites && isLoggedIn) {
        where.id = { in: [...favoriteRecipeIds] };
    }

    const orderBy: RecipeOrderBy = sort === 'views' ? { views: 'desc' } : { createdAt: 'desc' };

    // The chips describe the whole collection rather than the current result,
    // because a chip that leads to an empty page is worse than no chip.
    const [recipes, categoryGroups, cuisineGroups, total]: [
        RecipeListRow[],
        FacetGroup[],
        FacetGroup[],
        number,
    ] = await Promise.all([
        prisma.recipe.findMany({
            where,
            // "Best rated" averages across a relation, which Prisma cannot order
            // by directly, so those are sorted below instead.
            orderBy: sort === 'rating' ? undefined : orderBy,
            include: { images: { orderBy: { id: 'asc' } }, ratings: true },
        }),
        prisma.recipe.groupBy({ by: ['category'], _count: { _all: true } }),
        prisma.recipe.groupBy({ by: ['nationality'], _count: { _all: true } }),
        prisma.recipe.count(),
    ]);

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

    if (sort === 'rating') {
        formattedRecipes.sort((a, b) => b.rating - a.rating);
    }

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 md:px-8">
            <header className="border-b border-[var(--color-border)] pb-8 pt-12 sm:pt-16">
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{tSite('title')}</h1>
                <p className="mt-3 font-serif text-lg italic text-gray-500 sm:text-xl">
                    {tSite('description')}
                </p>
            </header>

            <div className="py-6">
                <Suspense fallback={<div className="h-24" aria-hidden="true" />}>
                    <FilterChips
                        categories={toFacets(categoryGroups, 'category')}
                        cuisines={toFacets(cuisineGroups, 'nationality')}
                        isLoggedIn={isLoggedIn}
                        total={total}
                    />
                </Suspense>
            </div>

            {formattedRecipes.length > 0 ? (
                <>
                    <p className="border-t border-[var(--color-border)] pt-4 text-xs uppercase tracking-widest text-gray-400">
                        {t('resultCount', { count: formattedRecipes.length })}
                    </p>
                    <div className="flex flex-col divide-y divide-[var(--color-border)]">
                        {formattedRecipes.map((recipe) => (
                            <RecipeCard key={recipe.id} {...recipe} />
                        ))}
                    </div>
                </>
            ) : (
                <div className="border-t border-[var(--color-border)] py-20 text-center">
                    <p className="text-gray-500">{t('noResults')}</p>
                </div>
            )}
        </main>
    );
}
