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

        const { value } = await req.json();

        if (typeof value !== 'number' || value < 1 || value > 5) {
            return NextResponse.json({ message: 'Rating must be an integer between 1 and 5' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        // Upsert rating -> if they already rated, update it. If not, create it.
        const rating = await prisma.rating.upsert({
            where: {
                userId_recipeId: {
                    userId,
                    recipeId
                }
            },
            update: {
                value
            },
            create: {
                userId,
                recipeId,
                value
            }
        });

        // Calculate new average
        const allRatings = await prisma.rating.findMany({
            where: { recipeId }
        });

        const avgRating = allRatings.reduce((sum, r) => sum + r.value, 0) / allRatings.length;

        return NextResponse.json({ success: true, rating: rating.value, average: avgRating, totalRatings: allRatings.length });
    } catch (error) {
        console.error('Rating error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
