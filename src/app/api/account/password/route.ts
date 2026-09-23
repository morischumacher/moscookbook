import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import prisma from '@/lib/prisma';
import { getSession, requireUser } from '@/lib/auth';
import { sessionUserFrom } from '@/lib/session';
import { passwordMatches } from '@/lib/accountGuard';
import { BCRYPT_COST } from '@/lib/passwordHash';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { formatZodError } from '@/lib/zodMessage';

const schema = z.object({
    current: z.string().min(1, 'Your current password is required').max(200),
    // The same floor as registration. A rule that applies when an account is
    // made and not when its password is changed is a rule with a way round it.
    next: z.string().min(8, 'The new password must be at least 8 characters').max(200),
});

/**
 * Changing your own password while signed in.
 *
 * Until now the only way to a new password was "I forgot mine" — a mail, a
 * link, a form — which is a strange thing to have to do when you know the old
 * one perfectly well and simply want a different one. Every tool of this shape
 * has this; this one did not.
 *
 * Limited per account, not per address: this is a password check, and an
 * unlimited one is an oracle for whoever is holding somebody's unlocked phone.
 */
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const limit = await rateLimitShared(`password:${auth.user.id}`, 10, 15 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many attempts. Please wait a few minutes.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
        return NextResponse.json({ message: formatZodError(parsed.error) }, { status: 400 });
    }

    if (!(await passwordMatches(auth.user.id, parsed.data.current))) {
        return NextResponse.json({ message: 'That is not your current password.' }, { status: 403 });
    }

    const updated = await prisma.user.update({
        where: { id: auth.user.id },
        data: {
            password: await bcrypt.hash(parsed.data.next, BCRYPT_COST),
            // Every other device is signed out — a new password is what you
            // choose when you think the old one is known — and this one is
            // re-sealed with the new number so it stays signed in.
            sessionVersion: { increment: 1 },
        },
    });

    const session = await getSession();
    session.user = sessionUserFrom(updated);
    await session.save();

    /*
     * The session is left alone on purpose.
     *
     * Signing everybody out of everything is the right answer when a password
     * is changed because it was *stolen*, and this route can only be reached
     * by somebody who already knows the old one. Throwing this person out of
     * the tab they are standing in would be punishing the common case for the
     * shape of the rare one — and there is no session list here to clear the
     * other devices from anyway, so it would be a half-measure that merely
     * felt thorough.
     */
    return NextResponse.json({ ok: true });
}
