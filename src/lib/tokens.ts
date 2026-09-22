import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Random tokens, and what is done with them.
 *
 * Four modules each generated their own — the same `randomBytes(n)
 * .toString('base64url')` four times with a different `n` — and two of them,
 * the auth tokens and the capture tokens, carried the hash function and the
 * constant-time compare copied to the character, `try { Buffer.from(hex) }`
 * and all. Crypto is the code where two copies drifting is worst, because
 * the drift is invisible until it is not.
 *
 * The *sizes* stay with their callers; they are decisions about the thing
 * being protected and are documented where the thing lives. The mechanics
 * live here.
 */

/** `bytes` of randomness, URL-safe, no characters that get mangled in a chat. */
export function randomToken(bytes: number): string {
    return randomBytes(bytes).toString('base64url');
}

/**
 * The stored form.
 *
 * Only the hash is kept. A database dump should not hand someone a working
 * key, and the token is high-entropy and random, so a plain SHA-256 is right
 * — there is nothing to brute-force and no need for a slow KDF.
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time, so a wrong token leaks nothing through how long it takes.
 *
 * Both live callers look their token up *by hash* rather than comparing, which
 * is the better design — an indexed lookup has no comparison to time. This
 * exists for the case that does compare, and so that the case that does
 * compare has one correct implementation to reach for.
 */
export function tokenMatches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(hashToken(token), 'hex');

    let expected: Buffer;
    try {
        expected = Buffer.from(expectedHash, 'hex');
    } catch {
        return false;
    }

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
}

/** `<base>/<locale>/<path>`, with a stray trailing slash on the base removed. */
export function localeUrl(baseUrl: string, locale: string, path: string): string {
    return `${baseUrl.replace(/\/$/, '')}/${locale}/${path.replace(/^\//, '')}`;
}
