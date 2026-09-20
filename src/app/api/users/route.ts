import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                admin: true,
            },
            orderBy: { id: 'desc' },
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Fetch users error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
