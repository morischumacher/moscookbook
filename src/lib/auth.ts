import { cache } from 'react';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { NextResponse } from 'next/server';
import prisma from './prisma';
import { sessionOptions, SessionData, SessionUser } from './session';

/**
 * Reads the session from the incoming request cookies.
 * Safe to call from server components, route handlers and layouts.
 */
export async function getSession() {
    const cookieStore = await cookies();
    return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
    const session = await getSession();
    return session.user ?? null;
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

/**
 * The session's user, checked against the database.
 *
 * `session.user.admin` is a snapshot taken at sign-in and sealed into the
 * cookie. Nothing could change it afterwards: demoting somebody on the
 * people page, or deleting their account, changed a row and left their
 * cookie exactly as it was — good for fourteen days, with whatever it said
 * on the day it was issued. A demoted admin kept the admin API for two
 * weeks. So did a deleted one.
 *
 * So the guards ask the database. One indexed lookup by primary key per
 * guarded request, which is the price of a revocation that actually revokes.
 * `cache()` makes it once per request however many guards run.
 *
 * Fails closed. A database that will not answer means no one is anyone,
 * which on a route that is about to write to that database is not much of a
 * loss.
 *
 * The rendering helpers above are left alone on purpose: `getCurrentUser` is
 * called from fifty places to decide what to *show*, and a stale cookie
 * showing a button that the API then refuses is a cosmetic problem. The
 * admin layout does its own verified check for the same reason this does.
 */
export const currentUserVerified = cache(async (): Promise<SessionUser | null> => {
    const user = await getCurrentUser();
    if (!user) return null;

    // Annotated: without a generated client the result is loosely typed.
    const row: { admin: boolean } | null = await prisma.user
        .findUnique({ where: { id: user.id }, select: { admin: true } })
        .catch(() => null);

    if (!row) return null;

    return { ...user, admin: row.admin };
});

/**
 * The picture and the name as they are *now*, for the header's profile menu.
 *
 * Separate from `currentUserVerified` rather than folded into it: that one is
 * a permission check run on every admin page and in every guarded route, and
 * widening its `select` would make every one of those carry two columns
 * nothing in them reads. This is asked for once per page render, by the
 * navigation, and cached for the request like its neighbour — which is the
 * lesson VerifyBanner taught, where one uncached lookup became one query per
 * page per signed-in person.
 *
 * Falls back to the cookie's own name if the row cannot be read: a header
 * without a picture is a small loss, and a header that throws is the page.
 */
export const currentProfile = cache(
    async (): Promise<{ name: string; avatarUrl: string | null } | null> => {
        const user = await getCurrentUser();
        if (!user) return null;

        const row: { name: string; avatarUrl: string | null } | null = await prisma.user
            .findUnique({ where: { id: user.id }, select: { name: true, avatarUrl: true } })
            .catch(() => null);

        return row ?? { name: user.name, avatarUrl: null };
    }
);
