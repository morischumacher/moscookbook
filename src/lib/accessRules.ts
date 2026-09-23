/**
 * Who may see which page.
 *
 * Pulled out of the proxy so it can be tested, because this is the one piece of
 * the application where a mistyped character does not break anything visibly —
 * it just quietly publishes a private cookbook, and nothing tells you.
 *
 * The rule is the safe way round: a localised page needs an account unless it
 * is named as open. A page added next month is private until somebody decides
 * otherwise, rather than public until somebody notices.
 */

export type Access =
    /** Not one of our localised pages; the proxy leaves it alone. */
    | 'unmatched'
    /** No account needed. */
    | 'open'
    /** Any signed-in person. */
    | 'account'
    /** Admin only. */
    | 'admin'
    /**
     * One thing that may or may not be public — only the row knows.
     *
     * The proxy cannot answer this: it runs at the network edge, in front of
     * the application, and giving it a database connection to consult on every
     * request is the wrong shape for both. So it steps aside and the page
     * decides, which is the *one* kind of path in this file where the decision
     * is made somewhere else.
     *
     * Three of them now — a recipe, a blog entry, a collection — because all
     * three can be on the open web since the share control started offering
     * the same three stages for everything it shares. It was one when only
     * recipes had a public address.
     *
     * That is a real weakening — the central rule stops being the whole
     * answer — so the patterns below stay deliberately narrow: exactly one
     * segment after the section, nothing deeper. A page added at
     * `/recipe/<slug>/edit` tomorrow falls back to needing an account, rather
     * than inheriting a door somebody opened for a different purpose.
     *
     * Each of the three pages must enforce it, and check:design refuses to
     * let the recipe one stop.
     */
    | 'decides';

const LOCALISED = /^\/(?:en|de)(?:\/|$)/;
const ADMIN_PATH = /^\/(?:en|de)\/admin(?:\/|$)/;

/**
 * `/de/recipe/kaesespaetzle`, `/en/blog/some-entry`, `/de/collections/menue`
 * — and nothing with a further segment on any of them.
 *
 * The section lists are *not* here. `/de/blog` and `/de/collections` are
 * indexes of everything the household has, which is a different thing from
 * one entry somebody chose to publish, and they keep needing an account.
 */
const DECIDES_PATH = /^\/(?:en|de)\/(?:recipe|blog|collections)\/[^/]+\/?$/;

/**
 * The pages that have to work without an account, and why each one does: the
 * two sign-in pages, the three that arrive as a link in an e-mail, the share
 * links — `r` for a recipe, `p` for a written entry — whose whole point is to
 * be openable by someone who has no account and is not going to make one, and
 * the imprint and privacy pages, which exist *for* the people who have no
 * account and would be a joke behind a sign-in form.
 *
 * Anchored at a path segment boundary on both ends. Without the `(?:\/|$)` a
 * page called `/en/registered-users` would be read as starting with `register`
 * and let through.
 */
const OPEN_PATH = /^\/(?:en|de)\/(?:login|register|forgot|reset|verify|r|p|c|s|m|imprint|privacy)(?:\/|$)/;

/**
 * Whether the proxy lets a request through without looking at the session.
 *
 * Three of the five values. `open` and `unmatched` always did. `decides` was
 * *defined* above as "the proxy steps aside and the page decides" and
 * *tested* to be returned for a recipe path — and the proxy's own line
 * listed only the other two, so it fell through to the account check.
 * A public recipe was not reachable at its own address without an account,
 * only through a share link, and the page's public branch and the JSON-LD
 * it emits for search engines were unreachable code. The feature that
 * introduced `recipe` touched the rules and the page and never the proxy.
 *
 * The interaction map found it — by walking the edges, not by reading any
 * one file, since each file was consistent with itself. The decision lives
 * here now so that a test can hold all five values against it.
 */
export function proxyStepsAside(access: Access): boolean {
    return access === 'unmatched' || access === 'open' || access === 'decides';
}

export function pathAccess(pathname: string): Access {
    if (!LOCALISED.test(pathname)) return 'unmatched';
    if (ADMIN_PATH.test(pathname)) return 'admin';
    if (OPEN_PATH.test(pathname)) return 'open';
    // After the open list and after admin, so that neither can be widened by
    // a slug that happens to look like one of them.
    if (DECIDES_PATH.test(pathname)) return 'decides';
    return 'account';
}

/* -------------------------------------------------------------------------- */
/*  The API                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether an API path may be called without a session.
 *
 * Until now the proxy never ran on `/api` at all — its matcher listed only
 * the localised pages — so every guard was per-route and a route added
 * without `requireAdmin` was open by default. That is the opposite of the
 * rule the rest of this file exists for. Now the safe way round applies here
 * too: an API path needs a session unless it is named as open.
 *
 * What is named, and why each one has to be:
 *
 * - `auth/*` — signing in (with a password or a passkey), registering, the
 *   three e-mail-link flows, signing out. There is no session yet, or the
 *   point is to end one.
 * - `capture` — the iPhone shortcut. Authenticated by a device token in the
 *   body, not a cookie; a phone has no session and is not going to get one.
 * - `errors` — the client-side error reporter. It runs on the error page,
 *   which may be the page that broke *because* the session was broken.
 * - `recipes/<id>/view` — the view counter, which a public recipe's visitor
 *   increments without an account.
 * - `cron/*` — Vercel's scheduler, authenticated by `CRON_SECRET`.
 * - `shopping/shared/<token>` — a shopping list somebody was sent a link to,
 *   so the person in the shop can tick things off without an account. The
 *   token is the permission, checked in the route.
 *
 * - `work` — the work list: things the admin chose to publish for fixing,
 *   anonymized when they were shared (lib/workItems.ts). Read-only.
 *
 * Every route still does its own check. This is the net under them, not a
 * replacement for them: `errors` GET is admin-only inside the route even
 * though the path is open here, because the path is open for its POST.
 */
const OPEN_API = /^\/api\/(?:auth\/[a-z-]+|capture|errors|recipes\/\d+\/view|cron\/[a-z-]+|shopping\/shared\/[A-Za-z0-9_-]{16,64}|work|work\/\d+\/done)\/?$/;

export type ApiAccess = 'open' | 'session';

export function apiAccess(pathname: string): ApiAccess {
    return OPEN_API.test(pathname) ? 'open' : 'session';
}

/**
 * Whether a request that changes something came from our own pages.
 *
 * The session cookie is `SameSite=Lax`, which stops a cross-site form from
 * carrying it on a PUT, PATCH or DELETE — but Lax makes an exception for
 * top-level navigations, and a plain `<form method="POST">` is one. Next's
 * `Request.json()` does not check `Content-Type`, so a form with
 * `enctype="text/plain"` can deliver a syntactically valid JSON body to any
 * route. Lax was the only thing in the way, and this is the second thing.
 *
 * Two headers, both set by the browser and neither settable by a page:
 *
 * `Sec-Fetch-Site` says where the request came from relative to its target.
 * `cross-site` is refused outright. `same-origin`, `none` (typed into the
 * address bar, or a non-browser client) and absent (older browsers, curl,
 * the iPhone shortcut) are allowed through to the next check.
 *
 * `Origin` is compared, host to host, with the `Host` the request arrived on.
 * A request with no `Origin` at all is allowed: that is what a non-browser
 * client sends, and a non-browser client has no cookie jar to be tricked out
 * of. It is also what some browsers send on a same-origin GET, but GETs are
 * not checked here.
 *
 * Reads are not checked. A cross-site GET carries the cookie under Lax and
 * always has; refusing it would break links from anywhere, and a GET that
 * changes state is a bug in the route, not something this can fix.
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isCrossSiteWrite(
    method: string,
    headers: { get(name: string): string | null }
): boolean {
    if (!MUTATING.has(method.toUpperCase())) return false;

    const site = headers.get('sec-fetch-site');
    if (site === 'cross-site') return true;

    const origin = headers.get('origin');
    if (!origin) return false;

    // Vercel puts the public host in x-forwarded-host; a request that never
    // went through a proxy has it in Host. Either is the host the browser
    // believes it is talking to, which is what Origin must match.
    const host = headers.get('x-forwarded-host') ?? headers.get('host');
    if (!host) return true;

    try {
        return new URL(origin).host.toLowerCase() !== host.toLowerCase();
    } catch {
        return true;
    }
}
