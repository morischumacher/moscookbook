import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import RecipeArticle, { recipeInclude, type RecipeRow } from '@/components/recipe/RecipeArticle';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';

/**
 * A recipe someone was given a link to.
 *
 * Reached without an account, which is the whole point: a link you can send to
 * a friend who is not going to sign up for your cookbook to read how you make
 * a soup. Everything that needs an account — favourites, ratings, the view
 * counter — is simply not offered here.
 *
 * The token is the only thing standing between this page and the public, so it
 * is looked up exactly: an unknown token is a 404 and says nothing more.
 */
const loadShared = cache(async (token: string): Promise<RecipeRow | null> => {
    // A token is 16 random bytes in base64url. Anything else cannot be one, and
    // there is no reason to ask the database about it.
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;

    return prisma.recipe.findUnique({ where: { shareToken: token }, include: recipeInclude });
});

export async function generateMetadata({
    params,
}: {
    params: Promise<{ token: string; locale: string }>;
}): Promise<Metadata> {
    const { token, locale } = await params;
    const recipe = await loadShared(token);

    const tRecipe = await getTranslations({ locale, namespace: 'Recipe' });

    if (!recipe) return { title: tRecipe('notFound'), robots: { index: false, follow: false } };

    const description =
        recipe.description?.trim() ||
        `${recipe.category ? recipe.category + ' · ' : ''}${tRecipe('metaFallback')}`;

    // A recipe with no photograph still has to look like something when it is
    // sent to someone. Without a picture WhatsApp and Signal show a bare link,
    // which reads like spam; the branded card at least says where it is from.
    const image = recipe.images[0]?.url ?? '/og-default.png';
    const url = shareUrl(getSiteUrl(), locale, token);

    return {
        title: `${recipe.title} — mo'scookbook`,
        description,
        // The link is secret, and a page a search engine has indexed is not.
        // The preview cards below still work: WhatsApp, Signal and iMessage
        // fetch the page when the link is pasted, they do not consult an index.
        robots: { index: false, follow: false, nocache: true },
        openGraph: {
            type: 'article',
            siteName: "mo'scookbook",
            locale,
            title: recipe.title,
            description,
            publishedTime: recipe.createdAt.toISOString(),
            url,
            images: [{ url: image, alt: recipe.title, width: 1200, height: 630 }],
        },
        twitter: {
            card: 'summary_large_image',
            title: recipe.title,
            description,
            images: [image],
        },
    };
}

export default async function SharedRecipePage({
    params,
}: {
    params: Promise<{ token: string; locale: string }>;
}) {
    const { token, locale } = await params;

    const recipe = await loadShared(token);
    if (!recipe) notFound();

    const tShare = await getTranslations('Share');
    const url = shareUrl(getSiteUrl(), locale, token);

    return (
        <>
            <p className="print:hidden border-b border-line px-4 py-3 text-center text-sm text-muted">
                {tShare('sharedNotice')}{' '}
                <Link href="/login" className="underline underline-offset-4">
                    {tShare('sharedLogin')}
                </Link>
            </p>

            <RecipeArticle
                recipe={recipe}
                locale={locale}
                mode="shared"
                isLoggedIn={false}
                isAdmin={false}
                isFavorited={false}
                userRatingValue={0}
                views={recipe.views}
                url={url}
                publicUrl={null}
            />
        </>
    );
}
