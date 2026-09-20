import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const ADMIN_PATH = /^\/(?:en|de)\/admin(?:\/|$)/;

export default async function middleware(req: NextRequest) {
    const res = intlMiddleware(req);

    if (ADMIN_PATH.test(req.nextUrl.pathname)) {
        const session = await getIronSession<SessionData>(req, res, sessionOptions);

        if (!session.user?.admin) {
            const locale = req.nextUrl.pathname.split('/')[1];
            const activeLocale = routing.locales.includes(locale as 'en' | 'de') ? locale : routing.defaultLocale;
            return NextResponse.redirect(new URL(`/${activeLocale}/login`, req.url));
        }
    }

    return res;
}

export const config = {
    matcher: ['/', '/(de|en)/:path*'],
};
