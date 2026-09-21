import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { hashToken, tokenState } from '@/lib/authTokens';

const schema = z.object({
    token: z.string().trim().min(1).max(200),
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
    const limit = rateLimit(clientKey(req, 'verify'), 20, 60 * 60 * 1000);

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
            where: { tokenHash, purpose: 'verify', usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now },
        });

        const record = await prisma.authToken.findUnique({ where: { tokenHash } });

        if (claimed.count !== 1) {
            const state = tokenState(record, 'verify', now);

            // A used token whose owner is confirmed means this link already did
            // its job — most often because the mail client opened it first.
            if (state === 'used' && record) {
                const user = await prisma.user.findUnique({ where: { id: record.userId } });
                if (user?.emailVerifiedAt) {
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

        await prisma.user.update({
            where: { id: record.userId },
            data: { emailVerifiedAt: now },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Address confirmation failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
