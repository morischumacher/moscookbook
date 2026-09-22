import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';

/**
 * Marks an error as dealt with.
 *
 * Not a delete: if it happens again the reporter clears `resolvedAt` and the
 * row comes back with its history, which is how you find out that a fix did
 * not hold.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await context.params;
    const errorId = positiveIntId(id);

    if (errorId === null) {
        return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
    }

    await prisma.errorLog.updateMany({
        where: { id: errorId },
        data: { resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await context.params;
    const errorId = positiveIntId(id);

    if (errorId === null) {
        return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
    }

    await prisma.errorLog.deleteMany({ where: { id: errorId } });
    return NextResponse.json({ ok: true });
}
