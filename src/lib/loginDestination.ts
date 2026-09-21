/**
 * Where to go after signing in.
 *
 * The proxy puts the page somebody was trying to reach in `?next=`, so that a
 * link to a recipe does not dump them on the front page once they have typed
 * their password.
 *
 * Two things are refused. Anything that is not a path of our own: `//evil.test`
 * is a protocol-relative URL, and a login form that forwards to it on request
 * is an open redirect — the classic way a phishing link is made to start at a
 * domain the victim trusts. And the locale prefix, which the locale-aware
 * router adds back by itself and would otherwise appear twice.
 */
export function destinationFrom(next: string | null | undefined, fallback: string): string {
    if (!next) return fallback;
    if (!next.startsWith('/') || next.startsWith('//')) return fallback;
    // A backslash is a path separator to some browsers but not to the URL
    // parser, which is exactly the gap "/\evil.test" is built to fall through.
    if (next.startsWith('/\\')) return fallback;

    const withoutLocale = next.replace(/^\/(?:en|de)(?=\/|$)/, '');
    return withoutLocale === '' ? '/' : withoutLocale;
}
