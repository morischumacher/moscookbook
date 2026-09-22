import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await params;
        const recipeId = positiveIntId(id);

        if (recipeId === null) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        try {
            await prisma.favorite.create({
                data: { userId: auth.user.id, recipeId },
            });
        } catch (error) {
            // Already favourited — that is the desired end state, so report success.
            if (isPrismaError(error, 'P2002')) {
                return NextResponse.json({ success: true, favorited: true });
            }
            if (isPrismaError(error, 'P2003')) {
                return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
            }
            throw error;
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
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await params;
        const recipeId = positiveIntId(id);

        if (recipeId === null) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        await prisma.favorite.deleteMany({
            where: { userId: auth.user.id, recipeId },
        });

        return NextResponse.json({ success: true, favorited: false });
    } catch (error) {
        console.error('Favorite DELETE error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
