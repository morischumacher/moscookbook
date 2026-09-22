import { randomToken, localeUrl } from './tokens';

/**
 * The single-use tokens that arrive by e-mail.
 *
 * Two purposes, one mechanism, because they have identical security needs: a
 * long random string that is mailed to an address, stored only as a hash,
 * usable once, and expiring on its own.
 *
 * Why only the hash is stored: this token is, for the minutes it lives, as good
 * as the password. Someone who reads the database must not be able to take over
 * an account with it — which is the whole point of hashing passwords, and it
 * would be strange to hash those and then keep a live skeleton key in the next
 * table.
 */

export type TokenPurpose = 'reset' | 'verify';

/**
 * How long each kind is good for.
 *
 * A reset link is a live key to an account, so it is short: long enough to
 * walk to a laptop, not long enough to sit in a mailbox for a week. A
 * verification link proves an address exists and grants nothing, so it can
 * afford to be patient with someone who reads mail on Sunday.
 */
export const TOKEN_LIFETIME_MINUTES: Record<TokenPurpose, number> = {
    reset: 60,
    verify: 7 * 24 * 60,
};

/** 256 bits, URL-safe. It travels in a link, so it must survive being pasted. */
export function generateToken(): string {
    return randomToken(32);
}

export { hashToken, tokenMatches } from './tokens';

export function expiryFor(purpose: TokenPurpose, now = new Date()): Date {
    return new Date(now.getTime() + TOKEN_LIFETIME_MINUTES[purpose] * 60 * 1000);
}

export interface TokenRecord {
    purpose: string;
    expiresAt: Date;
    usedAt: Date | null;
}

export type TokenState = 'valid' | 'used' | 'expired' | 'wrongPurpose' | 'unknown';

/**
 * The single place that decides whether a token may be redeemed.
 *
 * One function rather than a condition at each call site, because "expired"
 * and "already used" are exactly the checks that get forgotten in the second
 * place they are needed.
 */
export function tokenState(
    record: TokenRecord | null,
    purpose: TokenPurpose,
    now = new Date()
): TokenState {
    if (!record) return 'unknown';
    if (record.purpose !== purpose) return 'wrongPurpose';
    if (record.usedAt !== null) return 'used';
    if (record.expiresAt.getTime() <= now.getTime()) return 'expired';
    return 'valid';
}

/** The link that goes in the message. */
export function tokenUrl(
    baseUrl: string,
    locale: string,
    path: 'reset' | 'verify',
    token: string
): string {
    return localeUrl(baseUrl, locale, `${path}?token=${encodeURIComponent(token)}`);
}
