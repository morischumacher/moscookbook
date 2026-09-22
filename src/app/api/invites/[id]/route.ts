import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

/** Revokes an invite. */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await params;
        const inviteId = positiveIntId(id);

        if (inviteId === null) {
            return NextResponse.json({ message: 'Invalid invite ID' }, { status: 400 });
        }

        await prisma.invite.delete({ where: { id: inviteId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Invite not found' }, { status: 404 });
        }
        failed('Delete invite error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
