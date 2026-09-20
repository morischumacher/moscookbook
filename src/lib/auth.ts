import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { NextResponse } from 'next/server';
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
    const user = await getCurrentUser();

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
    const user = await getCurrentUser();

    if (!user) {
        return {
            response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
        };
    }

    return { user };
}
