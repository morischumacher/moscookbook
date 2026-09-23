import { cache } from 'react';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { NextResponse } from 'next/server';
import prisma from './prisma';
import { sessionOptions, sessionStillValid, SessionData, SessionUser } from './session';

/**
 * Reads the session from the incoming request cookies.
 * Safe to call from server components, route handlers and layouts.
 */
export async function getSession() {
    const cookieStore = await cookies();
    return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * The session's user, checked against the database.
 *
 * `session.user` is a snapshot sealed into the cookie at sign-in, and nothing
 * could change it afterwards: a deleted account, a demotion or a password
 * reset left the cookie exactly as it was, good for fourteen days. Guards were
 * checked; pages were not, so a removed member went on reading every private
 * recipe until the cookie ran out.
 *
 * So every read asks the database, once per request thanks to `cache()`: the
 * row must still exist and its `sessionVersion` must match the cookie's. The
 * same lookup brings the current name and picture, which the header used to
 * fetch with a query of its own — so this costs nothing it did not already.
 *
 * Fails closed. A database that will not answer means no one is anyone.
 */
const verifiedSession = cache(
    async (): Promise<{ user: SessionUser; avatarUrl: string | null } | null> => {
        const session = await getSession();
        const cookie = session.user;
        if (!cookie) return null;

        const row = await prisma.user
            .findUnique({
                where: { id: cookie.id },
                select: { admin: true, name: true, avatarUrl: true, sessionVersion: true },
            })
            .catch(() => null);

        if (!row || !sessionStillValid(cookie, row)) return null;

        return { user: { ...cookie, admin: row.admin, name: row.name }, avatarUrl: row.avatarUrl };
    }
);

export async function getCurrentUser(): Promise<SessionUser | null> {
    return (await verifiedSession())?.user ?? null;
}

/**
 * Guard for route handlers. Returns either the admin user or a ready-to-return
 * 401 response, so handlers can stay a single early-return line:
 *
 *   const auth = await requireAdmin();
 *   if ('response' in auth) return auth.response;
 */
export async function requireAdmin(): Promise<
    { user: SessionUser } | { response: NextResponse }
> {
    const user = await currentUserVerified();

    if (!user?.admin) {
        return {
            response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
        };
    }

    return { user };
}

/** Same as requireAdmin, but only requires a signed-in user. */
export async function requireUser(): Promise<
    { user: SessionUser } | { response: NextResponse }
> {
    const user = await currentUserVerified();

    if (!user) {
        return {
            response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
        };
    }

    return { user };
}

/** The same check as `getCurrentUser`; kept as a name the guards read well with. */
export const currentUserVerified = getCurrentUser;

/** The picture and the name as they are *now*, for the header's profile menu. */
export async function currentProfile(): Promise<{ name: string; avatarUrl: string | null } | null> {
    const verified = await verifiedSession();
    return verified ? { name: verified.user.name, avatarUrl: verified.avatarUrl } : null;
}
