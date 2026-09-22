import { SessionOptions } from 'iron-session';

/**
 * Only ever used when running locally without a configured secret.
 * In production a missing or too-short secret is a hard failure, because
 * anyone who knows the cookie password can forge an admin session.
 */
const DEV_FALLBACK_PASSWORD = 'dev-only-insecure-session-password-change-me';

let warnedAboutFallback = false;

function resolveSessionPassword(): string {
    const password = process.env.SECRET_COOKIE_PASSWORD;

    if (password && password.length >= 32) {
        return password;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            'SECRET_COOKIE_PASSWORD is missing or shorter than 32 characters. ' +
            'Set it in the environment before starting the app (see .env.example).'
        );
    }

    if (!warnedAboutFallback) {
        warnedAboutFallback = true;
        console.warn(
            '[session] SECRET_COOKIE_PASSWORD is not set (or too short). ' +
            'Falling back to an insecure development password — never use this in production.'
        );
    }

    return DEV_FALLBACK_PASSWORD;
}

export const sessionOptions: SessionOptions = {
    // Resolved per request rather than at module load, so that a build
    // without the secret still succeeds while a request without it fails loudly.
    get password() {
        return resolveSessionPassword();
    },
    cookieName: 'mos_cookbook_session',
    /*
     * Fourteen days, which was already the case — it is iron-session's
     * default — but it was the case by omission, and a number that matters
     * this much should be one somebody wrote down. The cookie is sealed and
     * carries its own expiry, so this is an absolute lifetime from sign-in,
     * not an idle timeout; there is no server-side store to extend it.
     *
     * Revocation does not depend on it any more: the API guards check the
     * user row on every guarded request (see lib/auth.ts), so a deleted or
     * demoted account is refused at once, and the fourteen days only decide
     * how often somebody who is still welcome has to type a password.
     */
    ttl: 60 * 60 * 24 * 14,
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    },
};

export interface SessionUser {
    id: number;
    email: string;
    name: string;
    admin: boolean;
}

export interface SessionData {
    user?: SessionUser;
}

declare module 'iron-session' {
    interface IronSessionData {
        user?: SessionUser;
    }
}
