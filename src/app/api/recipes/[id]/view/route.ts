import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const recipeId = positiveIntId(id);

        if (recipeId === null) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        // The one write on this site that needs no account, so the one write
        // anybody can repeat. The cookie below is the real deduplication, but
        // a cookie is set by the caller and a caller who declines to keep it
        // can count the same recipe as often as it likes — a loop with no
        // cookie jar was an unbounded stream of UPDATEs against the production
        // pool, and a view count that means nothing.
        const limit = rateLimit(clientKey(req, 'view'), 120, 60 * 1000);
        if (!limit.ok) {
            // Quietly: a view is not something the reader asked for, so a
            // refusal is not something they need told about.
            return NextResponse.json({ message: 'Too many views' }, { status: 200 });
        }

        const user = await getCurrentUser();

        // Don't let the author inflate their own view counts.
        if (user?.admin) {
            return NextResponse.json({ message: 'Admin view ignored' }, { status: 200 });
        }

        const cookieStore = await cookies();
        const viewedCookieName = `viewed_recipe_${recipeId}`;

        if (cookieStore.has(viewedCookieName)) {
            return NextResponse.json({ message: 'Already viewed' }, { status: 200 });
        }

        // Only a recipe the caller could have opened: without an account that
        // is a published one. updateMany, so an unknown id is no error.
        await prisma.recipe.updateMany({
            where: { id: recipeId, isDraft: false, ...(user ? {} : { isPublic: true }) },
            data: { views: { increment: 1 } },
        });

        const res = NextResponse.json({ success: true });

        res.cookies.set(viewedCookieName, 'true', {
            maxAge: 60 * 60 * 24,
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
        });

        return res;
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        failed('View tracking error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
