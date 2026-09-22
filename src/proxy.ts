import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { routing } from '@/i18n/routing';
import { pathAccess, apiAccess, isCrossSiteWrite } from '@/lib/accessRules';

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
    const { pathname } = req.nextUrl;

    /*
     * The API, before anything to do with locales.
     *
     * Ordered like this because next-intl's middleware would otherwise try to
     * put a locale prefix on `/api/…`, and an API that redirects to
     * `/de/api/…` is an API that does not work. The API branch never touches
     * `intlMiddleware` and returns plain `next()` or a JSON refusal.
     */
    if (pathname.startsWith('/api/')) return apiGate(req);

    const res = intlMiddleware(req);

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

/**
 * The net under the API routes.
 *
 * Two questions, both answered in lib/accessRules where they can be tested:
 * did this request come from our own pages, and does this path need a
 * session? A route's own guard still runs afterwards. This exists so that the
 * route somebody adds next month without one is refused here rather than
 * open until somebody notices — which is the same rule the pages have had
 * since the cookbook stopped being public.
 */
async function apiGate(req: NextRequest): Promise<NextResponse> {
    if (isCrossSiteWrite(req.method, req.headers)) {
        return NextResponse.json({ message: 'Cross-site request refused.' }, { status: 403 });
    }

    if (apiAccess(req.nextUrl.pathname) === 'open') return NextResponse.next();

    const res = NextResponse.next();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.user) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    return res;
}

export const config = {
    matcher: ['/', '/(de|en)/:path*', '/api/:path*'],
};
