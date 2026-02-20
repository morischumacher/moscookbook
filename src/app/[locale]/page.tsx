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

    const { sort: sortParam, category: categoryParam, nationality: nationalityParam, favorites } = await searchParams;

    const sort = (sortParam as string) || 'recent';
    const category = (categoryParam as string) || '';
    const nationality = (nationalityParam as string) || '';
    const showFavorites = favorites === 'true';

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const isLoggedIn = !!session.user;

    // Build where clause
    const where: any = {};
    if (category) where.category = category;
    if (nationality) where.nationality = nationality;

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

    // When not sorting by rating, we can just fetch normally
    let recipes;

    if (sort === 'rating') {
        // Prisma doesn't support direct sorting by aggregated average rating natively in findMany yet
        // So we fetch all, calculate, and sort in memory (acceptable for small datasets)
        const allRecipes = await prisma.recipe.findMany({
            where,
            include: { images: true, ratings: true }
        });

        recipes = allRecipes.map(r => {
            const avgRating = r.ratings.length > 0
                ? r.ratings.reduce((acc, curr) => acc + curr.value, 0) / r.ratings.length
                : 0;
            return { ...r, calculatedRating: avgRating };
        }).sort((a, b) => b.calculatedRating - a.calculatedRating);
    } else {
        recipes = await prisma.recipe.findMany({
            where,
            orderBy,
            include: { images: true, ratings: true }
        });
    }

    // Map to match RecipeCard props (image handling and rating)
    const formattedRecipes = recipes.map(r => {
        let avgRating = 0;
        if ('calculatedRating' in r) {
            avgRating = (r as any).calculatedRating;
        } else if (r.ratings && r.ratings.length > 0) {
            avgRating = r.ratings.reduce((acc, curr) => acc + curr.value, 0) / r.ratings.length;
        }

        return {
            ...r,
            description: r.description || '',
            category: r.category || '',
            nationality: r.nationality || '',
            imageUrl: r.images[0]?.url || '',
            rating: avgRating
        };
    });

    return (
        <main className="container" style={{ paddingBottom: 'var(--space-xxl)', paddingTop: 'var(--space-xl)' }}>

            <Suspense fallback={<div>Loading filters...</div>}>
                <FilterBar isLoggedIn={isLoggedIn} />
            </Suspense>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-lg)', paddingTop: 'var(--space-md)' }}>
                {formattedRecipes.map(recipe => (
                    <RecipeCard
                        key={recipe.id}
                        {...recipe}
                    />
                ))}
                {formattedRecipes.length === 0 && (
                    <p style={{ gridColumn: '1 / -1', color: 'var(--color-neutral)', marginTop: 'var(--space-lg)' }}>
                        No recipes found matching your criteria.
                    </p>
                )}
            </div>
        </main>
    );
}
