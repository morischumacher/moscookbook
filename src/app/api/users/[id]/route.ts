import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await params;
        const targetUserId = Number.parseInt(id, 10);

        if (Number.isNaN(targetUserId)) {
            return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
        }

        if (auth.user.id === targetUserId) {
            return NextResponse.json(
                { message: 'Cannot delete your own account.' },
                { status: 403 }
            );
        }

        await prisma.user.delete({ where: { id: targetUserId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        console.error('Delete user error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
