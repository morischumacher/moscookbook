import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { BCRYPT_COST } from '@/lib/passwordHash';
import prisma from '@/lib/prisma';
import { sessionOptions, sessionUserFrom, SessionData } from '@/lib/session';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { hashToken, tokenState } from '@/lib/authTokens';
import { failed } from '@/lib/reportServerError';

const schema = z.object({
    token: z.string().trim().min(1).max(200),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

/**
 * Redeem a reset link and set the new password.
 *
 * The redemption is a single conditional UPDATE rather than a read followed by
 * a write: two taps on the same link, or the mail client that fetches every URL
 * in a message to preview it, must not both come away holding a valid token.
 * `updateMany` with the conditions in the WHERE clause gives exactly one winner.
 *
 * `tokenState` is still consulted, but only to say *why* a link did not work.
 */
export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'reset'), 20, 60 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json(
            { message: parsed.error.issues[0]?.message ?? 'Invalid input data', reason: 'invalid' },
            { status: 400 }
        );
    }

    const { token, password } = parsed.data;
    const now = new Date();

    try {
        const tokenHash = hashToken(token);

        const claimed = await prisma.authToken.updateMany({
            where: { tokenHash, purpose: 'reset', usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now },
        });

        if (claimed.count !== 1) {
            const record = await prisma.authToken.findUnique({ where: { tokenHash } });
            const state = tokenState(record, 'reset', now);

            return NextResponse.json(
                { message: 'This link cannot be used any more.', reason: state },
                { status: 400 }
            );
        }

        const record = await prisma.authToken.findUnique({ where: { tokenHash } });
        if (!record) {
            return NextResponse.json({ message: 'Unknown link.', reason: 'unknown' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

        const user = await prisma.user.update({
            where: { id: record.userId },
            data: {
                password: hashedPassword,
                // Following a link sent to the address is proof the address
                // works and belongs to whoever holds the account. Asking for
                // that proof a second time, in a separate mail, would be
                // ceremony rather than security.
                emailVerifiedAt: now,
                // Whoever else is signed in to this account is signed out: a
                // reset is what somebody does when they think a password is
                // known to someone else.
                sessionVersion: { increment: 1 },
            },
        });

        // Every other outstanding key to this account, of either kind, is now
        // stale. A password change is exactly the moment to sweep them.
        await prisma.authToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: now },
        });

        // Signed in straight away: they have just proved control of the mailbox
        // and chosen a password, and sending them to a login form to type it
        // again on a phone keyboard is friction with nothing behind it.
        const res = NextResponse.json({ success: true, admin: user.admin });
        const session = await getIronSession<SessionData>(req, res, sessionOptions);

        session.user = sessionUserFrom(user);

        await session.save();

        return res;
    } catch (error) {
        failed('Password reset failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
