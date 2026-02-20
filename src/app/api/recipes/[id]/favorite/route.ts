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

        if (isNaN(recipeId)) return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });

        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const userId = session.user.id;

        // Try creating favorite (ignore if already exists due to unique constraint)
        try {
            await prisma.favorite.create({
                data: { userId, recipeId }
            });
        } catch (e: any) {
            // Prisma error P2002 means unique constraint failed (already favorited)
            if (e.code !== 'P2002') throw e;
        }

        return NextResponse.json({ success: true, favorited: true });
    } catch (error) {
        console.error('Favorite POST error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const recipeId = parseInt(id, 10);

        if (isNaN(recipeId)) return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });

        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const userId = session.user.id;

        await prisma.favorite.deleteMany({
            where: { userId, recipeId }
        });

        return NextResponse.json({ success: true, favorited: false });
    } catch (error) {
        console.error('Favorite DELETE error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
