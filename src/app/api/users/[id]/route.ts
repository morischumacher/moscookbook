import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';
import { ownerId } from '@/lib/userProtection';

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await params;
        const targetUserId = positiveIntId(id);

        if (targetUserId === null) {
            return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
        }

        if (auth.user.id === targetUserId) {
            return NextResponse.json(
                { message: 'Cannot delete your own account.' },
                { status: 403 }
            );
        }
        if (targetUserId === (await ownerId())) {
            return NextResponse.json({ message: 'The owner of the cookbook cannot be deleted.' }, { status: 403 });
        }

        const gone = await prisma.user.delete({ where: { id: targetUserId }, select: { avatarUrl: true } });
        await deleteBlobs([gone.avatarUrl]);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        failed('Delete user error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
