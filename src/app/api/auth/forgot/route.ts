import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { issueToken } from '@/lib/issueToken';
import { failed } from '@/lib/reportServerError';

const schema = z.object({
    email: z.string().trim().email().max(320),
    locale: z.enum(['en', 'de']).optional(),
});

/**
 * "I forgot my password."
 *
 * Always answers the same way, whether or not the address belongs to an
 * account. Anything else turns this endpoint into a way of asking "is this
 * person a member of this cookbook", and for an invite-only site that is a
 * question worth not answering.
 *
 * Two limits, because they stop different things. The per-IP one stops someone
 * walking a list of addresses; the per-address one stops someone using this
 * cookbook to fill a stranger's inbox with mail they did not ask for.
 */
export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'forgot'), 10, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { ok: true },
            { status: 200, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    // Even a malformed address gets the neutral answer: a 400 here would say
    // "that one is not even shaped like an address", which is true but is also
    // the start of the same guessing game.
    if (!parsed.success) return NextResponse.json({ ok: true });

    const { email, locale = 'en' } = parsed.data;

    const perAddress = await rateLimitShared(`forgot:address:${email.toLowerCase()}`, 3, 60 * 60 * 1000);
    if (!perAddress.ok) return NextResponse.json({ ok: true });

    try {
        const user =
            (await prisma.user.findUnique({ where: { email } })) ??
            (await prisma.user.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } },
            }));

        if (user) {
            await issueToken(user, 'reset', locale);
        }
    } catch (error) {
        // Logged, not reported. The person is told the same thing either way,
        // so that a failure here cannot be used to probe for accounts.
        failed('Password reset request failed:', error);
    }

    return NextResponse.json({ ok: true });
}
