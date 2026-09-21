import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { issueToken } from '@/lib/issueToken';

const schema = z.object({
    locale: z.enum(['en', 'de']).optional(),
});

/**
 * Send the confirmation mail again.
 *
 * Only for the person who is already signed in and asking about their own
 * address, so there is nothing to hide here and the answers can be honest.
 * Limited per account rather than per IP: the thing being rationed is mail to
 * one mailbox, and a household behind one address should not run out because
 * someone else in it signed up first.
 */
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const limit = await rateLimitShared(`resend:${auth.user.id}`, 3, 60 * 60 * 1000);

    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Please wait a little before asking for another e-mail.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    const locale = parsed.success ? parsed.data.locale ?? 'en' : 'en';

    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });

    if (!user) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (user.emailVerifiedAt) {
        return NextResponse.json({ success: true, alreadyVerified: true });
    }

    const result = await issueToken(user, 'verify', locale);

    if (result === 'notConfigured') {
        return NextResponse.json({ message: 'Sending mail is not set up.', reason: result }, { status: 503 });
    }

    if (result === 'failed') {
        return NextResponse.json({ message: 'The e-mail could not be sent.', reason: result }, { status: 502 });
    }

    return NextResponse.json({ success: true });
}
