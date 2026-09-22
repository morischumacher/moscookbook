import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/siteUrl';

/**
 * Almost nothing here is for a search engine.
 *
 * This used to disallow everything, and that was the truth at the time: every
 * page either needed an account — a crawler would only ever see the login form
 * — or was a share link, which is secret and says so in its own meta tags.
 *
 * Recipes can now be published one at a time, and a published recipe is a page
 * on the web that is allowed to be found. So `/en/recipe/` and `/de/recipe/`
 * are opened and everything else stays shut.
 *
 * **A crawler being allowed in is not what makes a page public.** Each recipe
 * still decides for itself, on the server, and a private one redirects to the
 * sign-in form whoever asks. This file only stops robots wasting their time
 * and ours on addresses that would refuse them; the `index: false` that a
 * private recipe sends in its own metadata is the belt to this pair of braces.
 *
 * The sitemap lists the recipes that really are public, which is the part a
 * search engine actually follows.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: ['/en/recipe/', '/de/recipe/'],
            // Everything else: the cookbook itself, the blog, the admin area,
            // and `/r/` and `/p/`, which are secret links somebody may have
            // pasted somewhere public without meaning to publish them.
            disallow: '/',
        },
        sitemap: `${getSiteUrl()}/sitemap.xml`,
    };
}
