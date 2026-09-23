import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { passwordMatches } from '@/lib/accountGuard';
import { issueToken } from '@/lib/issueToken';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { formatZodError } from '@/lib/zodMessage';
import { describeWriteFailure } from '@/lib/prismaErrors';
import { failed } from '@/lib/reportServerError';

const schema = z.object({
    password: z.string().min(1, 'Your password is required').max(200),
    email: z.string().trim().toLowerCase().email('That is not an e-mail address').max(320),
    locale: z.enum(['en', 'de']).optional(),
});

/**
 * Changing the address mail goes to.
 *
 * ## Nothing changes until the new address answers
 *
 * The new address is parked in `pendingEmail` and a link is mailed to it.
 * Only following that link moves it across. Until then the account signs in
 * with, and resets its password through, the address it had — so a typo in
 * the new one costs nothing but a second try. (It used to change at once and
 * ask for confirmation afterwards, which left an account whose only address
 * was a typo one forgotten password away from being lost.)
 *
 * The password is asked for, because an address is how an account is taken
 * back; the old address is told once the move actually happens (see the
 * verify route), because that is when it stops being the account's.
 *
 * Mail failing does not fail the request: the row keeps the pending address,
 * and "send the link again" is on the account page.
 */
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const limit = await rateLimitShared(`email:${auth.user.id}`, 5, 60 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many attempts. Please wait a while.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
        return NextResponse.json({ message: formatZodError(parsed.error) }, { status: 400 });
    }

    const { password, email, locale = 'en' } = parsed.data;

    if (!(await passwordMatches(auth.user.id, password))) {
        return NextResponse.json({ message: 'That is not your password.' }, { status: 403 });
    }

    const me: { id: number; email: string; name: string } | null = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { id: true, email: true, name: true },
    });

    if (!me) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // The address it already has: whatever was pending is dropped.
    if (me.email === email) {
        await cancelPending(me.id);
        return NextResponse.json({ ok: true, unchanged: true });
    }

    const taken = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, NOT: { id: me.id } },
        select: { id: true },
    });
    if (taken) {
        return NextResponse.json({ message: 'That address already belongs to another account.' }, { status: 409 });
    }

    /*
     * Every earlier link withdrawn before the new address is parked, and
     * awaited. The link applies whatever address is pending when it is
     * followed, so a link sent to an address the person controls, still
     * valid after a second change to somebody else's, moved the account to
     * that address unconfirmed. issueToken withdraws them too — but after the
     * response, which a serverless function may never get to.
     */
    await prisma.$transaction([
        prisma.authToken.updateMany({
            where: { userId: me.id, purpose: 'email', usedAt: null },
            data: { usedAt: new Date() },
        }),
        prisma.user.update({ where: { id: me.id }, data: { pendingEmail: email } }),
    ]);

    void issueToken({ ...me, email }, 'email', locale).catch((error) =>
        failed('account/email: confirmation to the new address', error)
    );

    return NextResponse.json({ ok: true, pending: email });
}

const resendSchema = z.object({ locale: z.enum(['en', 'de']).optional() });

/** "Send the link again" — to the address that is waiting, if one is. */
export async function PUT(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const limit = await rateLimitShared(`email:${auth.user.id}`, 5, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many attempts. Please wait a while.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    // A malformed body is not a reason to fail: the link just goes in English.
    const resend = resendSchema.safeParse(await req.json().catch(() => ({})));
    const locale = (resend.success && resend.data.locale) || 'en';
    const me = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { id: true, name: true, pendingEmail: true },
    });
    if (!me?.pendingEmail) {
        return NextResponse.json({ message: 'No new address is waiting to be confirmed.' }, { status: 400 });
    }

    try {
        await issueToken({ id: me.id, name: me.name, email: me.pendingEmail }, 'email', locale);
    } catch (error) {
        failed('account/email: resending the confirmation', error);
        return NextResponse.json({ message: describeWriteFailure(error) }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

/** Never mind: the waiting address is dropped and its link stops working. */
export async function DELETE() {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;
    await cancelPending(auth.user.id);
    return NextResponse.json({ ok: true });
}

async function cancelPending(userId: number): Promise<void> {
    await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { pendingEmail: null } }),
        prisma.authToken.updateMany({ where: { userId, purpose: 'email', usedAt: null }, data: { usedAt: new Date() } }),
    ]);
}
