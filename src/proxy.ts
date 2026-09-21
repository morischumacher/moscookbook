import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { routing } from '@/i18n/routing';
import { pathAccess } from '@/lib/accessRules';

const intlMiddleware = createMiddleware(routing);

/**
 * Renamed from `middleware` in Next.js 16: the file convention is now `proxy`,
 * which describes it better — it runs at a network boundary in front of the
 * app, not as Express-style middleware inside it.
 *
 * It is also where the cookbook stopped being public. Which paths need what is
 * decided by pathAccess, in src/lib/accessRules.ts, where it can be tested.
 */
export default async function proxy(req: NextRequest) {
    const res = intlMiddleware(req);
    const { pathname } = req.nextUrl;

    const access = pathAccess(pathname);
    if (access === 'unmatched' || access === 'open') return res;

    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    const allowed = access === 'admin' ? Boolean(session.user?.admin) : Boolean(session.user);

    if (allowed) return res;

    const locale = pathname.split('/')[1];
    const activeLocale = routing.locales.includes(locale as 'en' | 'de')
        ? locale
        : routing.defaultLocale;

    const login = new URL(`/${activeLocale}/login`, req.url);

    // Where they were headed, so that tapping a link to a recipe and then
    // signing in lands on the recipe rather than on the front page. Only the
    // path travels, never a full URL: `next=https://elsewhere` would turn the
    // login form into an open redirect. A signed-in person who is merely not an
    // admin gets no `next`, because sending them back to a door that is still
    // shut would be a loop.
    if (!session.user) login.searchParams.set('next', pathname + req.nextUrl.search);

    return NextResponse.redirect(login);
}

export const config = {
    matcher: ['/', '/(de|en)/:path*'],
};
