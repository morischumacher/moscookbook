import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const recipeId = parseInt(id, 10);

        if (isNaN(recipeId)) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (session.user?.admin) {
            return NextResponse.json({ message: 'Admin view ignored' }, { status: 200 });
        }

        const viewedCookieName = `viewed_recipe_${recipeId}`;
        const hasViewed = cookieStore.has(viewedCookieName);

        if (hasViewed) {
            return NextResponse.json({ message: 'Already viewed' }, { status: 200 });
        }

        await prisma.recipe.update({
            where: { id: recipeId },
            data: { views: { increment: 1 } }
        });

        const res = NextResponse.json({ success: true });

        res.cookies.set(viewedCookieName, 'true', {
            maxAge: 60 * 60 * 24,
            path: '/',
            httpOnly: true,
            sameSite: 'lax'
        });

        return res;
    } catch (error) {
        console.error('View tracking error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
