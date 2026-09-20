import { Suspense } from 'react';
import FilterBar from '@/components/FilterBar';
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

function averageRating(ratings: { value: number }[]): number {
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, rating) => sum + rating.value, 0) / ratings.length;
}

export default async function HomePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
    params: Promise<{ locale: string }>;
}) {
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

    const recipes: RecipeListRow[] = await prisma.recipe.findMany({
        where,
        // "Best rated" is an average across a relation, which Prisma cannot
        // order by directly, so those are sorted below instead.
        orderBy: sort === 'rating' ? undefined : orderBy,
        include: { images: true, ratings: true },
    });

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
        <main className="container mx-auto px-4 md:px-8 pb-32 pt-16">
            <Suspense fallback={<div>Loading filters...</div>}>
                <FilterBar isLoggedIn={isLoggedIn} />
            </Suspense>

            <div className="flex flex-col max-w-3xl mx-auto divide-y divide-gray-200 dark:divide-gray-800 pt-8">
                {formattedRecipes.map((recipe) => (
                    <RecipeCard key={recipe.id} {...recipe} />
                ))}
                {formattedRecipes.length === 0 && (
                    <p className="text-gray-500 mt-8 text-center">
                        No recipes found matching your criteria.
                    </p>
                )}
            </div>
        </main>
    );
}
