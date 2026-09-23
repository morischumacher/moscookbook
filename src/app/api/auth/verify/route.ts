import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { forgetVerified } from '@/lib/verifiedFlag';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { hashToken, tokenState } from '@/lib/authTokens';
import { failed } from '@/lib/reportServerError';
import { emailChangedMail } from '@/lib/authMail';
import { sendMail } from '@/lib/mailer';

const schema = z.object({
    token: z.string().trim().min(1).max(200),
    locale: z.enum(['en', 'de']).optional(),
});

/**
 * Confirm an address.
 *
 * Same single-UPDATE redemption as the reset route, for the same reason: mail
 * clients and link scanners follow URLs in messages, and a confirmation that
 * only works if nothing fetched it first is a confirmation that fails for the
 * people whose mail provider is careful.
 *
 * An already-confirmed address answers `success` rather than an error. The
 * person did the thing that was asked of them; which of their two taps landed
 * first is not their problem.
 */
export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'verify'), 20, 60 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json({ message: 'Invalid link.', reason: 'invalid' }, { status: 400 });
    }

    const now = new Date();

    try {
        const tokenHash = hashToken(parsed.data.token);

        const claimed = await prisma.authToken.updateMany({
            where: { tokenHash, purpose: { in: ['verify', 'email'] }, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now },
        });

        const record = await prisma.authToken.findUnique({ where: { tokenHash } });

        if (claimed.count !== 1) {
            const state = tokenState(record, record?.purpose === 'email' ? 'email' : 'verify', now);

            // A used token whose owner is confirmed means this link already did
            // its job — most often because the mail client opened it first.
            if (state === 'used' && record) {
                const user = await prisma.user.findUnique({ where: { id: record.userId } });
                if (user?.emailVerifiedAt && !(record.purpose === 'email' && user.pendingEmail)) {
                    return NextResponse.json({ success: true, alreadyVerified: true });
                }
            }

            return NextResponse.json(
                { message: 'This link cannot be used any more.', reason: state },
                { status: 400 }
            );
        }

        if (!record) {
            return NextResponse.json({ message: 'Unknown link.', reason: 'unknown' }, { status: 400 });
        }

        if (record.purpose === 'email') {
            return await moveToNewAddress(record.userId, now, parsed.data.locale ?? 'de');
        }

        await prisma.user.update({
            where: { id: record.userId },
            data: { emailVerifiedAt: now },
        });

        // The banner reads a cached copy of this flag; without clearing it, the
        // reminder to confirm would outlive the confirming by up to an hour.
        forgetVerified(record.userId);

        return NextResponse.json({ success: true });
    } catch (error) {
        failed('Address confirmation failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

/**
 * The new address answered: it becomes the account's address, confirmed, and
 * the old one is told — now, when it has actually stopped being the account's.
 */
async function moveToNewAddress(userId: number, now: Date, locale: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, pendingEmail: true },
    });
    if (!user?.pendingEmail) {
        return NextResponse.json({ message: 'This link cannot be used any more.', reason: 'used' }, { status: 400 });
    }

    const taken = await prisma.user.findFirst({
        where: { email: { equals: user.pendingEmail, mode: 'insensitive' }, NOT: { id: user.id } },
        select: { id: true },
    });
    if (taken) {
        return NextResponse.json({ message: 'That address already belongs to another account.', reason: 'taken' }, { status: 409 });
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { email: user.pendingEmail, emailVerifiedAt: now, pendingEmail: null },
    });
    // A reset link already sent to the old address must not outlive the
    // move: the address may have been changed because that mailbox is not
    // safe any more.
    await prisma.authToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    forgetVerified(user.id);

    // after(), not a promise left running: once the answer is sent a
    // serverless function may be frozen, and this notice is the one that says
    // an account's address changed.
    const notice = emailChangedMail(user.email, user.name, user.pendingEmail, locale);
    after(() => sendMail(notice).catch((error) => failed('verify: notice to the old address', error)));

    return NextResponse.json({ success: true, emailChanged: true });
}
