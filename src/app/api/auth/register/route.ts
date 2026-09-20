import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { isPrismaError } from '@/lib/prismaErrors';
import { sessionOptions, SessionData } from '@/lib/session';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import prisma from '@/lib/prisma';

const registerSchema = z.object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1, 'Name is required').max(100),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    invite: z.string().trim().min(1, 'An invitation is required').max(200),
});

export async function POST(req: NextRequest) {
    const limit = rateLimit(clientKey(req, 'register'), 5, 60 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many sign-up attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = registerSchema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json(
            { message: parsed.error.issues[0]?.message ?? 'Invalid input data' },
            { status: 400 }
        );
    }

    const { email, name, password, invite } = parsed.data;

    // Claim the invite before creating anything. updateMany with the conditions
    // in the WHERE clause makes this atomic: if two people redeem the same link
    // at the same moment, exactly one of them gets count === 1.
    const claimed = await prisma.invite.updateMany({
        where: { code: invite, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
    });

    if (claimed.count !== 1) {
        return NextResponse.json(
            { message: 'This invitation is not valid any more.' },
            { status: 403 }
        );
    }

    const releaseInvite = async () => {
        await prisma.invite
            .updateMany({ where: { code: invite }, data: { usedAt: null } })
            .catch(() => undefined);
    };

    try {
        const existingUser = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
        });

        if (existingUser) {
            await releaseInvite();
            return NextResponse.json({ message: 'User already exists' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
                admin: false, // Admin rights are only ever granted by another admin.
            },
        });

        await prisma.invite.updateMany({
            where: { code: invite },
            data: { usedById: user.id },
        });

        const res = NextResponse.json({ success: true });
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
        // Whatever went wrong, the invitation must not be burned.
        await releaseInvite();

        if (isPrismaError(error, 'P2002')) {
            return NextResponse.json({ message: 'User already exists' }, { status: 409 });
        }

        console.error('Registration error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
