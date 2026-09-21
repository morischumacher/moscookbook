import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sessionOptions, SessionData } from '@/lib/session';
import { clientKey } from '@/lib/rateLimit';
import { rateLimitShared } from '@/lib/rateLimitShared';
import prisma from '@/lib/prisma';

const loginSchema = z.object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(200),
});

/**
 * Compared against when no user exists, so that a wrong email and a wrong
 * password take roughly the same amount of time and cannot be told apart.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'login'), 10, 15 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many login attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    try {
        const parsed = loginSchema.safeParse(await req.json());

        if (!parsed.success) {
            return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        }

        const { email, password } = parsed.data;

        // Exact match first, then case-insensitive so that "Moritz@..." and
        // "moritz@..." both reach the same account.
        const user =
            (await prisma.user.findUnique({ where: { email } })) ??
            (await prisma.user.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } },
            }));

        let isValid = false;
        if (user) {
            isValid = await bcrypt.compare(password, user.password);
        } else {
            // Burn the same amount of time as a real comparison would.
            await bcrypt.compare(password, DUMMY_HASH);
        }

        if (!user || !isValid) {
            return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        }

        const res = NextResponse.json({ success: true, admin: user.admin });
        const session = await getIronSession<SessionData>(req, res, sessionOptions);

        session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            admin: user.admin,
        };

        await session.save();

        return res;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
