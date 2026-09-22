import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';

/**
 * Revokes a token.
 *
 * Marked rather than deleted: `lastUsedAt` on a revoked token is how you find
 * out whether the phone you lost was still posting afterwards.
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await context.params;
    const tokenId = positiveIntId(id);

    if (tokenId === null) {
        return NextResponse.json({ message: 'Invalid token id' }, { status: 400 });
    }

    await prisma.captureToken.updateMany({
        where: { id: tokenId, revokedAt: null },
        data: { revokedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
}
