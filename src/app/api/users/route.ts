import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user?.admin) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                admin: true,
            },
            orderBy: {
                id: 'desc'
            }
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Fetch users error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
