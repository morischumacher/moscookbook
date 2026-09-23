import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';
import { hiddenFrom } from '@/lib/recipeVisibilityDb';

const rateSchema = z.object({
    value: z.number().int().min(1).max(5),
});

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

        // An "only me" recipe answers as a missing one would.
        if (await hiddenFrom(recipeId, auth.user)) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        const parsed = rateSchema.safeParse(await req.json().catch(() => null));

        if (!parsed.success) {
            return NextResponse.json(
                { message: 'Rating must be a whole number between 1 and 5' },
                { status: 400 }
            );
        }

        const { value } = parsed.data;
        const userId = auth.user.id;

        const rating = await prisma.rating.upsert({
            where: { userId_recipeId: { userId, recipeId } },
            update: { value },
            create: { userId, recipeId, value },
        });

        const aggregate = await prisma.rating.aggregate({
            where: { recipeId },
            _avg: { value: true },
            _count: { value: true },
        });

        return NextResponse.json({
            success: true,
            rating: rating.value,
            average: aggregate._avg.value ?? 0,
            totalRatings: aggregate._count.value,
        });
    } catch (error) {
        // Foreign key violation: the recipe does not exist.
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        failed('Rating error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
