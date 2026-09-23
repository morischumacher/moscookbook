import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireAdmin } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';
import { collectionInputSchema, formatCollectionError } from '@/lib/collectionSchema';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

/** Editing and removing one collection. Admin only, like making one. */

function parseId(raw: string): number | null {
    return positiveIntId(raw);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id: raw } = await params;
    const id = parseId(raw);
    if (id === null) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });

    const parsed = collectionInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: formatCollectionError(parsed.error) }, { status: 400 });
    }

    const { title, description, imageUrl, recipeIds } = parsed.data;

    try {
        // The picture it is about to stop pointing at, read before the write.
        const before = await prisma.collection.findUnique({ where: { id }, select: { imageUrl: true } });

        // Replaced wholesale rather than diffed, like a recipe's ingredients:
        // the list is short, the order is what somebody arranged, and a rewrite
        // keeps the positions contiguous. In one transaction, so a failure
        // halfway cannot leave a collection with half its recipes.
        const [collection] = await prisma.$transaction([
            prisma.collection.update({
                where: { id },
                data: { title, description, imageUrl },
                select: { id: true, slug: true, title: true },
            }),
            prisma.collectionRecipe.deleteMany({ where: { collectionId: id } }),
            ...(recipeIds.length > 0
                ? [
                    prisma.collectionRecipe.createMany({
                        data: recipeIds.map((recipeId, index) => ({
                            collectionId: id,
                            recipeId,
                            position: index,
                        })),
                    }),
                ]
                : []),
        ]);

        // After the write, never before: a file cannot be un-deleted if the
        // write fails. The same rule a recipe's gallery follows.
        if (before?.imageUrl && before.imageUrl !== imageUrl) await deleteBlobs([before.imageUrl]);

        return NextResponse.json(collection);
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'That collection is gone.' }, { status: 404 });
        }
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json(
                { message: 'One of those recipes no longer exists.' },
                { status: 409 }
            );
        }

        failed('Collection could not be saved:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id: raw } = await params;
    const id = parseId(raw);
    if (id === null) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });

    try {
        // The rows in the join table go with it; the recipes do not. Deleting a
        // menu must never delete the food.
        const doomed = await prisma.collection.findUnique({ where: { id }, select: { imageUrl: true } });
        const removed = await prisma.collection.deleteMany({ where: { id } });

        // Its own picture goes with it; an orphaned file is billed for ever.
        if (removed.count === 1 && doomed?.imageUrl) await deleteBlobs([doomed.imageUrl]);

        return NextResponse.json({ success: true, removed: removed.count });
    } catch (error) {
        failed('Collection could not be deleted:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
