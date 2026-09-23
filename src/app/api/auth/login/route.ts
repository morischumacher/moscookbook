import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sessionOptions, sessionUserFrom, SessionData } from '@/lib/session';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import prisma from '@/lib/prisma';
import { failed } from '@/lib/reportServerError';
import { DUMMY_HASH } from '@/lib/passwordHash';

const loginSchema = z.object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'login'), 10, 15 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many login attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    try {
        const parsed = loginSchema.safeParse(await req.json().catch(() => null));

        if (!parsed.success) {
            return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        }

        const { email, password } = parsed.data;

        /*
         * A second bucket, per account.
         *
         * The one above is per address, which stops one machine guessing. It
         * does nothing against many machines guessing at one account: ten
         * tries each from a rotating pool is unlimited tries. So the account
         * gets its own count, keyed on the lowercased address — twenty in
         * fifteen minutes, wider than the per-address one so that a household
         * behind one router does not lock its own member out after a typo,
         * but a ceiling all the same.
         *
         * Counted before the lookup, and for addresses that exist and ones
         * that do not alike, so the count itself does not say which is which.
         */
        const account = await rateLimitShared(`login:account:${email.toLowerCase()}`, 20, 15 * 60 * 1000);
        if (!account.ok) {
            return NextResponse.json(
                { message: 'Too many login attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(account.retryAfterSeconds) } }
            );
        }

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

        session.user = sessionUserFrom(user);

        await session.save();

        return res;
    } catch (error) {
        failed('Login error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
