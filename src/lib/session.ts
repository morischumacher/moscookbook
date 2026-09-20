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
