import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { currentUserVerified } from '@/lib/auth';
import { sessionOptions } from '@/lib/session';
import { failed } from '@/lib/reportServerError';

export async function POST(req: NextRequest) {
    try {
        /*
         * `{ everywhere: true }` signs out every device, not only this one.
         * The cookie is stateless, so destroying it here does nothing about a
         * phone left in a café; raising the account's session version does.
         * Only a session that is still valid may do it — which also means a
         * stale cookie cannot be used to sign its owner out of everything.
         */
        const body: unknown = await req.json().catch(() => null);
        const everywhere =
            typeof body === 'object' && body !== null && (body as { everywhere?: unknown }).everywhere === true;

        if (everywhere) {
            const user = await currentUserVerified();
            if (user) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { sessionVersion: { increment: 1 } },
                });
            }
        }

        const cookieStore = await cookies();
        const session = await getIronSession(cookieStore, sessionOptions);

        session.destroy();

        return NextResponse.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        failed('Logout error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
