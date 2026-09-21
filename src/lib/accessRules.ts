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
    | 'admin';

const LOCALISED = /^\/(?:en|de)(?:\/|$)/;
const ADMIN_PATH = /^\/(?:en|de)\/admin(?:\/|$)/;

/**
 * The pages that have to work without an account, and why each one does: the
 * two sign-in pages, the three that arrive as a link in an e-mail, and the
 * share links — `r` for a recipe, `p` for a written entry — whose whole point
 * is to be openable by someone who has no account and is not going to make one.
 *
 * Anchored at a path segment boundary on both ends. Without the `(?:\/|$)` a
 * page called `/en/registered-users` would be read as starting with `register`
 * and let through.
 */
const OPEN_PATH = /^\/(?:en|de)\/(?:login|register|forgot|reset|verify|r|p)(?:\/|$)/;

export function pathAccess(pathname: string): Access {
    if (!LOCALISED.test(pathname)) return 'unmatched';
    if (ADMIN_PATH.test(pathname)) return 'admin';
    if (OPEN_PATH.test(pathname)) return 'open';
    return 'account';
}
