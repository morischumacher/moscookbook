import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const targetUserId = parseInt(id, 10);

        if (isNaN(targetUserId)) {
            return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user?.admin) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Prevent admin from deleting themselves
        if (session.user.id === targetUserId) {
            return NextResponse.json({ message: 'Cannot delete your own account.' }, { status: 403 });
        }

        await prisma.user.delete({
            where: { id: targetUserId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
