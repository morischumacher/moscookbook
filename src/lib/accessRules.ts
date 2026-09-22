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
     * One recipe, which may or may not be public — only the row knows.
     *
     * The proxy cannot answer this: it runs at the network edge, in front of
     * the application, and giving it a database connection to consult on every
     * request is the wrong shape for both. So it steps aside and the page
     * decides, which is the *one* place in this file where the decision is
     * made somewhere else.
     *
     * That is a real weakening — the central rule stops being the whole
     * answer — so the pattern below is deliberately narrow: exactly one
     * segment after `/recipe/`, nothing deeper. A page added at
     * `/recipe/<slug>/edit` tomorrow falls back to needing an account, rather
     * than inheriting a door somebody opened for a different purpose.
     *
     * src/app/[locale]/recipe/[slug]/page.tsx is the page that must enforce
     * it, and check:design refuses to let it stop.
     */
    | 'recipe';

const LOCALISED = /^\/(?:en|de)(?:\/|$)/;
const ADMIN_PATH = /^\/(?:en|de)\/admin(?:\/|$)/;

/** `/de/recipe/kaesespaetzle`, and nothing with a further segment on it. */
const RECIPE_PATH = /^\/(?:en|de)\/recipe\/[^/]+\/?$/;

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
const OPEN_PATH = /^\/(?:en|de)\/(?:login|register|forgot|reset|verify|r|p|c|imprint|privacy)(?:\/|$)/;

export function pathAccess(pathname: string): Access {
    if (!LOCALISED.test(pathname)) return 'unmatched';
    if (ADMIN_PATH.test(pathname)) return 'admin';
    if (OPEN_PATH.test(pathname)) return 'open';
    // After the open list and after admin, so that neither can be widened by
    // a slug that happens to look like one of them.
    if (RECIPE_PATH.test(pathname)) return 'recipe';
    return 'account';
}
