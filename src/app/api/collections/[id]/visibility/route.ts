import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

/**
 * Publishing one collection to the open web, or taking it back.
 *
 * The third twin. Nothing conditional to check here: a collection has no
 * draft state of its own — what it contains has one, and that is answered
 * where it matters rather than here. A public collection shows a stranger
 * only the recipes that are public in their own right; see
 * lib/collectionVisibility. Publishing a menu must not publish what is on it.
 */

const schema = z.object({ isPublic: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const collectionId = positiveIntId(id);

    if (collectionId === null) {
        return NextResponse.json({ message: 'Invalid collection id' }, { status: 400 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json({ message: 'Public or not?' }, { status: 400 });
    }

    try {
        const updated: { count: number } = await prisma.collection.updateMany({
            where: { id: collectionId },
            data: { isPublic: parsed.data.isPublic },
        });

        if (updated.count !== 1) {
            return NextResponse.json({ message: 'That collection no longer exists.' }, { status: 404 });
        }

        return NextResponse.json({ success: true, isPublic: parsed.data.isPublic });
    } catch (error) {
        failed('Collection visibility failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
