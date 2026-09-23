import type { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { getSiteUrl } from '@/lib/siteUrl';

/**
 * Everything that is actually public, in both languages.
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
 * Three kinds of thing since an entry and a collection could be published
 * too — the same rule applies to each, and each is filtered on its own row
 * rather than on a rule somebody remembered: only `isPublic`, and for an
 * entry also actually published in the blog, because a switch flicked on an
 * unfinished entry must not hand a crawler a draft.
 *
 * Nothing else is listed. The cookbook itself, the blog index, the collections
 * index and every share link need either an account or a secret, and a sitemap
 * entry for any of them would be an invitation to a door that does not open.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const site = getSiteUrl();

    let recipes: { slug: string; createdAt: Date }[] = [];
    let posts: { slug: string; createdAt: Date }[] = [];
    let collections: { slug: string; createdAt: Date }[] = [];

    try {
        [recipes, posts, collections] = await Promise.all([
            prisma.recipe.findMany({
                // A draft cannot be public, so this is belt to that brace — and
                // the brace is a rule in a route, while this is a file Google reads.
                where: { isPublic: true, isDraft: false },
                select: { slug: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5000,
            }),
            prisma.post.findMany({
                // Published in the blog *and* public on the web. The route
                // refuses the first without the second; this does not rely on
                // the route having been the only way in.
                where: { isPublic: true, publishedAt: { not: null } },
                select: { slug: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5000,
            }),
            prisma.collection.findMany({
                where: { isPublic: true },
                select: { slug: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5000,
            }),
        ]);
    } catch (error) {
        // An empty sitemap is a fine answer to a crawler; an exception here
        // would be a 500 on a file robots.txt points at, which is worse.
        console.error('Could not build the sitemap:', error);
        return [];
    }

    /** One row, in both languages, each naming the other. */
    const entries = (section: string, rows: { slug: string; createdAt: Date }[]) =>
        rows.flatMap((row) =>
            (['de', 'en'] as const).map((locale) => ({
                url: `${site}/${locale}/${section}/${row.slug}`,
                lastModified: row.createdAt,
                alternates: {
                    languages: {
                        de: `${site}/de/${section}/${row.slug}`,
                        en: `${site}/en/${section}/${row.slug}`,
                    },
                },
            }))
        );

    return [
        ...entries('recipe', recipes),
        ...entries('blog', posts),
        ...entries('collections', collections),
    ];
}
