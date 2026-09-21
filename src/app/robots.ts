import type { MetadataRoute } from 'next';

/**
 * Nothing here is for a search engine any more.
 *
 * Every page either needs an account — a crawler would only ever see the login
 * form — or is a share link, which is secret and says so in its own meta tags.
 * Disallowing everything is simply the truth written down, and it keeps a
 * shared link out of an index if somebody posts one somewhere public.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: '*', disallow: '/' },
    };
}
