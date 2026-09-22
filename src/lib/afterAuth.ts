/**
 * Leaving a page after signing in.
 *
 * `router.push()` followed by `router.refresh()` was wrong, and wrong in a way
 * that only showed up on a real deployment: the bar at the top said you were
 * signed in while the login form was still sitting under it with your address
 * in it. Next's client router navigates from its own cache, which was filled
 * before the session cookie existed; `refresh()` marks that cache stale but
 * races the navigation that already started.
 *
 * So signing in ends with a full document load. Everything — the layout, the
 * navigation, the page — is rendered again by the server with the cookie in
 * hand, and there is no cache left holding a version of the site where nobody
 * is logged in. It costs one page load at the one moment in a session when
 * nobody minds, and it cannot half-work.
 *
 * The URL is made absolute against the current origin before it is assigned:
 * an absolute one is what the lint rule wants, and building it through `URL`
 * means a path that somehow arrived with a host in it cannot send anybody
 * anywhere else.
 */
function localeHref(locale: string, path: string): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

export function goAfterAuth(locale: string, path: string): void {
    const target = new URL(localeHref(locale, path), window.location.origin);

    // Same-origin by construction, and checked anyway: `new URL` resolves a
    // relative path against the origin, so this can only fail if the path was
    // not relative — which is the case worth refusing.
    if (target.origin !== window.location.origin) {
        window.location.assign(new URL(`/${locale}`, window.location.origin).toString());
        return;
    }

    window.location.assign(target.toString());
}
