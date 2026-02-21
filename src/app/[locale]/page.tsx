import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import FilterBar from '@/components/FilterBar';
import RecipeCard from '@/components/RecipeCard';
import prisma from '@/lib/prisma';
import { getDictionary } from '@/lib/getDictionary';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';

export default async function HomePage({
    searchParams,
    params
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params;
    const dict = await getDictionary(locale as any);
    const t = (key: string) => (dict.HomePage as any)[key] || key;

    const { sort: sortParam, category: categoryParam, nationality: nationalityParam, favorites, search: searchParam } = await searchParams;

    const sort = (sortParam as string) || 'recent';
    const category = (categoryParam as string) || '';
    const nationality = (nationalityParam as string) || '';
    const search = (searchParam as string) || '';
    const showFavorites = favorites === 'true';

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const isLoggedIn = !!session.user;

    // Build where clause
    const where: any = {};
    if (category) where.category = category;
    if (nationality) where.nationality = nationality;

    // Handle search text query
    if (search) {
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
        ];
    }

    // Filter by favorites if requested and logged in
    if (showFavorites && isLoggedIn) {
        where.favorites = {
            some: {
                userId: session.user?.id
            }
        };
    }

    // Build orderBy
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'views') orderBy = { views: 'desc' };

    // Build query includes
    const includeQuery: any = { images: true, ratings: true };
    if (isLoggedIn) {
        includeQuery.favorites = {
            where: { userId: session.user?.id }
        };
    }

    // When not sorting by rating, we can just fetch normally
    let recipes;

    if (sort === 'rating') {
        // Prisma doesn't support direct sorting by aggregated average rating natively in findMany yet
        // So we fetch all, calculate, and sort in memory (acceptable for small datasets)
        const allRecipes = await prisma.recipe.findMany({
            where,
            include: includeQuery
        });

        recipes = allRecipes.map(r => {
            const rAny = r as any;
            const avgRating = rAny.ratings && rAny.ratings.length > 0
                ? rAny.ratings.reduce((acc: number, curr: any) => acc + curr.value, 0) / rAny.ratings.length
                : 0;
            return { ...r, calculatedRating: avgRating };
        }).sort((a: any, b: any) => b.calculatedRating - a.calculatedRating);
    } else {
        recipes = await prisma.recipe.findMany({
            where,
            orderBy,
            include: includeQuery
        });
    }

    // Map to match RecipeCard props (image handling and rating)
    const formattedRecipes = recipes.map(r => {
        const rAny = r as any;
        let avgRating = 0;
        if ('calculatedRating' in rAny) {
            avgRating = rAny.calculatedRating;
        } else if (rAny.ratings && rAny.ratings.length > 0) {
            avgRating = rAny.ratings.reduce((acc: number, curr: any) => acc + curr.value, 0) / rAny.ratings.length;
        }

        const isFavorited = rAny.favorites && rAny.favorites.length > 0;

        return {
            ...r,
            description: r.description || '',
            category: r.category || '',
            nationality: r.nationality || '',
            imageUrl: rAny.images[0]?.url || '',
            rating: avgRating,
            isFavorited,
            isLoggedIn
        };
    });

    return (
        <main className="container mx-auto px-4 md:px-8 pb-32 pt-16">

            <Suspense fallback={<div>Loading filters...</div>}>
                <FilterBar isLoggedIn={isLoggedIn} />
            </Suspense>

            <div className="flex flex-col max-w-3xl mx-auto divide-y divide-gray-200 dark:divide-gray-800 pt-8">
                {formattedRecipes.map(recipe => (
                    <RecipeCard
                        key={recipe.id}
                        {...recipe}
                    />
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
