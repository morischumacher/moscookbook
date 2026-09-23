import { getSiteUrl } from './siteUrl';

/**
 * Passkeys: signing in with Face ID, Touch ID or a password manager instead
 * of a password.
 *
 * A passkey is a key pair made on the device; the site keeps only the public
 * half, so there is nothing here worth stealing and nothing to phish — the
 * browser only ever offers a passkey to the site it was made for. The
 * password stays as the way in when no passkey is at hand.
 *
 * The one setting that matters is the relying party id: the domain a passkey
 * belongs to. It is the site's domain without `www.`, so that a passkey made
 * on www.moscookbook.com also works on moscookbook.com. It is derived from the
 * configured site address, never from the request, so a request with a
 * forged Host header cannot ask for a passkey that belongs to somewhere else.
 */

export const RP_NAME = "Mo'sCookbook";

/** How long a challenge may wait for its answer. */
export const CHALLENGE_MS = 5 * 60 * 1000;

export function relyingParty(requestOrigin: string | null = null): { rpID: string; origins: string[] } {
    const site = new URL(getSiteUrl());
    const host = site.hostname;

    // Local development: whichever port the server is on.
    if (host === 'localhost' || host === '127.0.0.1') {
        const local = requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin) ? requestOrigin : site.origin;
        return { rpID: new URL(local).hostname, origins: [local] };
    }

    const rpID = host.replace(/^www\./, '');
    return { rpID, origins: [`https://${rpID}`, `https://www.${rpID}`] };
}

/** "iPhone · Safari" — enough to tell two passkeys in a list apart. */
export function deviceName(userAgent: string | null): string {
    const ua = userAgent ?? '';
    const device = /iPhone/.test(ua)
        ? 'iPhone'
        : /iPad/.test(ua)
          ? 'iPad'
          : /Android/.test(ua)
            ? 'Android'
            : /Macintosh|Mac OS X/.test(ua)
              ? 'Mac'
              : /Windows/.test(ua)
                ? 'Windows'
                : /Linux/.test(ua)
                  ? 'Linux'
                  : '';
    const browser = /Edg\//.test(ua)
        ? 'Edge'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua) || /CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '';
    return [device, browser].filter(Boolean).join(' · ') || 'Passkey';
}

/** Whether a challenge from the cookie may still be answered. */
export function freshChallenge(
    stored: { challenge: string; purpose: 'register' | 'login'; at: number } | undefined,
    purpose: 'register' | 'login',
    now = Date.now()
): string | null {
    if (!stored || stored.purpose !== purpose) return null;
    if (now - stored.at > CHALLENGE_MS) return null;
    return stored.challenge;
}
