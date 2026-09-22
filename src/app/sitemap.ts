import type { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { getSiteUrl } from '@/lib/siteUrl';

/**
 * The recipes that are actually public, in both languages.
 *
 * Only `isPublic` rows, and that is the one thing this file must never get
 * wrong: a sitemap is an invitation, and listing a private address here would
 * hand a crawler a list of every recipe in a private cookbook — including the
 * titles, which are the part worth keeping to yourself.
 *
 * The pages are the same recipe in two languages rather than two documents, so
 * each entry names the other through `alternates`. Without it a search engine
 * is entitled to read them as duplicates and pick one, which is how a German
 * recipe ends up only findable in English.
 *
 * `lastModified` is the recipe's own createdAt rather than a timestamp of this
 * request: a sitemap that changes every time it is fetched teaches crawlers to
 * ignore the field.
 *
 * Nothing else is listed. The cookbook, the blog and the share links all need
 * either an account or a secret, and a sitemap entry for them would be an
 * invitation to a door that does not open.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const site = getSiteUrl();

    let recipes: { slug: string; createdAt: Date }[] = [];

    try {
        recipes = await prisma.recipe.findMany({
            where: { isPublic: true },
            select: { slug: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 5000,
        });
    } catch (error) {
        // An empty sitemap is a fine answer to a crawler; an exception here
        // would be a 500 on a file robots.txt points at, which is worse.
        console.error('Could not build the sitemap:', error);
        return [];
    }

    return recipes.flatMap((recipe) =>
        (['de', 'en'] as const).map((locale) => ({
            url: `${site}/${locale}/recipe/${recipe.slug}`,
            lastModified: recipe.createdAt,
            alternates: {
                languages: {
                    de: `${site}/de/recipe/${recipe.slug}`,
                    en: `${site}/en/recipe/${recipe.slug}`,
                },
            },
        }))
    );
}
