import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

/**
 * Removing one of your own passkeys. The device keeps its half until it is
 * deleted there too; it simply stops opening anything here.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const id = Number.parseInt((await params).id, 10);
    if (!Number.isInteger(id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });

    // Scoped to the owner in the query itself: someone else's id deletes nothing.
    await prisma.passkey.deleteMany({ where: { id, userId: auth.user.id } });
    return NextResponse.json({ ok: true });
}
