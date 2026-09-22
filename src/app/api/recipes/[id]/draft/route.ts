import { NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { forgetCollectionFacets } from '@/lib/collectionFacets';

/**
 * Finishing a draft.
 *
 * One direction only, and there is no route for the other one. A recipe can
 * stop being a draft; it cannot be sent back to being one.
 *
 * That asymmetry is deliberate rather than unfinished. Going back would mean a
 * recipe that is public having to un-publish itself, revoke a share link that
 * somebody may already have opened, and vanish from collections other people
 * can see — a great deal of machinery, every piece of it a place for a private
 * recipe to stay visible by accident, in service of an act nobody asked for.
 * A recipe that turned out not to be ready can be edited, or deleted and
 * imported again.
 *
 * `updateMany` with `isDraft: true` in the WHERE clause so that pressing twice
 * is not an error the second time and not a second write either: the first
 * press gets `count === 1`, the second gets zero and the same answer.
 */
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await context.params;
    const recipeId = Number.parseInt(id, 10);

    if (!Number.isInteger(recipeId) || recipeId <= 0) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    try {
        const finished: { count: number } = await prisma.recipe.updateMany({
            where: { id: recipeId, isDraft: true },
            data: { isDraft: false },
        });

        if (finished.count === 0) {
            const exists: { id: number } | null = await prisma.recipe.findUnique({
                where: { id: recipeId },
                select: { id: true },
            });

            if (!exists) {
                return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 404 });
            }
            // Already finished. Nothing happened, and nothing needed to.
            return NextResponse.json({ success: true, isDraft: false });
        }

        /*
         * A recipe appearing in the list for the first time, with a category
         * the filter rail has never counted. The chips are cached and count
         * only what the list shows, so this is exactly the moment that cache
         * is wrong. See lib/collectionFacets.
         */
        forgetCollectionFacets();

        return NextResponse.json({ success: true, isDraft: false });
    } catch (error) {
        console.error('Finishing a draft failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
