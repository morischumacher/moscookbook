import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import FilterBar from '@/components/FilterBar';
import RecipeCard from '@/components/RecipeCard';
import prisma from '@/lib/prisma';
import { MOCK_RECIPES } from '@/lib/mockData';
import { getDictionary } from '@/lib/getDictionary';

export default async function HomePage({
    searchParams,
    params
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
    params: Promise<{ locale: string }>
}) {
    // const t = await useTranslations('HomePage');
    const { locale } = await params;
    const dict = await getDictionary(locale as any);
    const t = (key: string) => (dict.HomePage as any)[key] || key;

    const { sort: sortParam, category: categoryParam, nationality: nationalityParam } = await searchParams;

    const sort = (sortParam as string) || 'recent';
    const category = (categoryParam as string) || '';
    const nationality = (nationalityParam as string) || '';

    // Build where clause
    const where: any = {};
    if (category) where.category = category;
    if (nationality) where.nationality = nationality;

    // Build orderBy
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'views') orderBy = { views: 'desc' };
    if (sort === 'rating') orderBy = { rating: 'desc' };

    const recipes = await prisma.recipe.findMany({
        where,
        orderBy,
        include: { images: true }
    });

    // Map to match RecipeCard props (image handling)
    const formattedRecipes = recipes.map(r => ({
        ...r,
        description: r.description || '',
        category: r.category || '',
        nationality: r.nationality || '',
        imageUrl: r.images[0]?.url || ''
    }));

    return (
        <main className="container" style={{ paddingBottom: '3rem' }}>
            <section style={{ padding: '4rem 0', textAlign: 'center' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>{t('title')}</h1>
                <p className="subtitle" style={{ fontSize: '1.25rem', color: 'var(--muted)', marginBottom: '2rem' }}>
                    {t('subtitle')}
                </p>
            </section>

            <Suspense fallback={<div>Loading filters...</div>}>
                <FilterBar />
            </Suspense>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
                {formattedRecipes.map(recipe => (
                    <RecipeCard
                        key={recipe.id}
                        {...recipe}
                    />
                ))}
                {formattedRecipes.length === 0 && (
                    <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--muted)', marginTop: '2rem' }}>
                        No recipes found matching your criteria.
                    </p>
                )}
            </div>
        </main>
    );
}
