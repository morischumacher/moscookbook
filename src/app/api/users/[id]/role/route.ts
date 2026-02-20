import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id, 10);

        if (isNaN(userId)) {
            return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user?.admin) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { admin } = await req.json();

        if (typeof admin !== 'boolean') {
            return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
        }

        // Prevent admin from removing their own admin privileges easily
        if (session.user.id === userId && !admin) {
            return NextResponse.json({ message: 'Cannot revoke your own admin privileges.' }, { status: 403 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { admin }
        });

        // Ensure we don't return the password hash
        const { password, ...userWithoutPassword } = updatedUser;

        return NextResponse.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        console.error('Update role error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
