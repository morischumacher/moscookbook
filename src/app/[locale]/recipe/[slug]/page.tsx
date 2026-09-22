import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import RecipeArticle, { recipeInclude, type RecipeRow } from '@/components/recipe/RecipeArticle';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';
import { similarRecipes } from '@/lib/similarRecipes';

// generateMetadata and the page itself both need the recipe; cache() makes
// that a single database round trip per request instead of two.
const loadRecipe = cache(async (slug: string): Promise<RecipeRow | null> => {
    return prisma.recipe.findUnique({ where: { slug }, include: recipeInclude });
});

/**
 * This page needs an account, so nothing here is for a crawler or a link
 * preview — neither can get past the login. It gets a title for the browser tab
 * and nothing else. The recipe's public face lives at /r/[token], and that is
 * where the OpenGraph card and the schema.org markup are.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
    const { slug, locale } = await params;
    const recipe = await loadRecipe(slug);

    const t = await getTranslations({ locale, namespace: 'Recipe' });

    if (!recipe) return { title: t('notFound') };

    return {
        title: `${recipe.title} — mo'scookbook`,
        robots: { index: false, follow: false },
    };
}

export default async function RecipePage({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}) {
    const { slug, locale } = await params;

    const recipe = await loadRecipe(slug);
    if (!recipe) notFound();

    const cookieStore = await cookies();
    const session = await getSession();
    const hasViewed = cookieStore.has(`viewed_recipe_${recipe.id}`);

    // Shown optimistically; the actual increment happens in ViewTracker so that
    // a server component never has to write a cookie.
    const views = !session.user?.admin && !hasViewed ? recipe.views + 1 : recipe.views;

    let isFavorited = false;
    let userRatingValue = 0;

    if (session.user) {
        const userId = session.user.id;
        const favorite = await prisma.favorite.findUnique({
            where: { userId_recipeId: { userId, recipeId: recipe.id } },
        });
        isFavorited = favorite !== null;
        userRatingValue =
            recipe.ratings.find((rating: { userId: number }) => rating.userId === userId)?.value ?? 0;
    }

    // Oldest first: a cooking log is read as a sequence. Drafts only for an
    // admin, same rule as the blog index.
    const notes = await prisma.post.findMany({
        where: {
            recipeId: recipe.id,
            ...(session.user?.admin ? {} : { publishedAt: { not: null } }),
        },
        orderBy: [{ publishedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 50,
        select: {
            id: true,
            title: true,
            slug: true,
            body: true,
            publishedAt: true,
            createdAt: true,
            author: { select: { name: true } },
        },
    });

    // Newest first: the question this section answers is "when did I last
    // make this", and the answer is then the first row.
    //
    // The pictures inside an entry go the other way, in the order somebody
    // arranged them — within one evening a sequence reads forwards.
    const cooked = await prisma.cookEntry.findMany({
        where: { recipeId: recipe.id },
        orderBy: { cookedAt: 'desc' },
        take: 30,
        select: {
            id: true,
            cookedAt: true,
            note: true,
            userId: true,
            user: { select: { name: true } },
            photos: { orderBy: { position: 'asc' }, select: { id: true, url: true } },
        },
    });

    // Computed from the recipe's own search vector, which already exists and
    // is already indexed. See lib/similarRecipes.
    const similar = await similarRecipes(recipe);

    return (
        <RecipeArticle
            recipe={recipe}
            similar={similar}
            notes={notes}
            cooked={cooked}
            currentUserId={session.user?.id ?? null}
            locale={locale}
            mode="private"
            isLoggedIn={Boolean(session.user)}
            isAdmin={Boolean(session.user?.admin)}
            isFavorited={isFavorited}
            userRatingValue={userRatingValue}
            views={views}
            url={`${getSiteUrl()}/${locale}/recipe/${recipe.slug}`}
            publicUrl={recipe.shareToken ? shareUrl(getSiteUrl(), locale, recipe.shareToken) : null}
        />
    );
}
