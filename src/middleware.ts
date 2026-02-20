import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

const intlMiddleware = createMiddleware({
    locales: ['en', 'de'],
    defaultLocale: 'en'
});

export default async function middleware(req: NextRequest) {
    const res = intlMiddleware(req);

    // Check for admin route protection
    // Note: This matches /en/admin, /de/admin, /admin
    if (req.nextUrl.pathname.match(/^\/(en|de)?\/admin/)) {
        const session = await getIronSession<SessionData>(req, res as any, sessionOptions);
        if (!session.user?.admin) {
            // Redirect to login
            const locale = req.nextUrl.pathname.split('/')[1] || 'en';
            // Basic check if first segment is locale
            const activelocale = ['en', 'de'].includes(locale) ? locale : 'en';
            return NextResponse.redirect(new URL(`/${activelocale}/login`, req.url));
        }
    }

    return res;
}

export const config = {
    // Match only internationalized pathnames
    matcher: ['/', '/(de|en)/:path*']
};
