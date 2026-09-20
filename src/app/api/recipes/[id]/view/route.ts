import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const recipeId = Number.parseInt(id, 10);

        if (Number.isNaN(recipeId)) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
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

        await prisma.recipe.update({
            where: { id: recipeId },
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

        console.error('View tracking error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
