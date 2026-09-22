import { localeUrl, randomToken } from './tokens';

/**
 * The public address of a recipe that is otherwise only for people with an
 * account.
 *
 * 128 bits, which is the same order of unguessability as the invitation codes
 * and far beyond anything that can be walked through: there is no list to
 * enumerate and no rate at which a stranger gets anywhere. Shorter than the
 * mailed tokens on purpose — this one is read aloud, pasted into a message and
 * occasionally typed, while a reset link is only ever clicked.
 *
 * Unguessable rather than a `public: true` flag, because the two answer
 * different questions. A flag makes a recipe visible to everyone at its normal
 * address for as long as it is set; this makes one link that can be handed to
 * one person, and taking it back is setting the column to null — the recipe
 * itself never changes its name, and the people who already have an account
 * never notice anything.
 */
export function generateShareToken(): string {
    return randomToken(16);
}

export type ShareKind = 'recipe' | 'post' | 'collection';

/**
 * One letter each, because these addresses get typed and read aloud.
 * `/de/r/<token>`, `/de/p/<token>`, `/de/c/<token>`.
 */
const SEGMENT: Record<ShareKind, string> = { recipe: 'r', post: 'p', collection: 'c' };

/**
 * The address to hand out. Built in one place so the API, the page and the
 * proxy's list of open paths cannot drift apart — `tests/access.test.ts`
 * checks that what this builds is something the proxy lets through.
 */
export function shareUrl(
    baseUrl: string,
    locale: string,
    token: string,
    kind: ShareKind = 'recipe'
): string {
    return localeUrl(baseUrl, locale, `${SEGMENT[kind]}/${token}`);
}
