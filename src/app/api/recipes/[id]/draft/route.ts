import { NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

/**
 * Finishing a draft.
 *
 * The way back is "Als Entwurf speichern" in the edit form (PUT with
 * `isDraft: true`, work #23): every page that shows a recipe already leaves
 * drafts out (`isDraft: false` in its query, a share link included), so a
 * recipe sent back disappears from them without further machinery.
 *
 * `updateMany` with `isDraft: true` in the WHERE clause so that pressing twice
 * is not an error the second time and not a second write either: the first
 * press gets `count === 1`, the second gets zero and the same answer.
 */
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await context.params;
    const recipeId = positiveIntId(id);

    if (recipeId === null) {
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
        failed('Finishing a draft failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
