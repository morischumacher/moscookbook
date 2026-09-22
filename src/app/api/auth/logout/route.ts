import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';
import { failed } from '@/lib/reportServerError';

export async function POST() {
    try {
        const cookieStore = await cookies();
        const session = await getIronSession(cookieStore, sessionOptions);

        session.destroy();

        return NextResponse.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        failed('Logout error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
