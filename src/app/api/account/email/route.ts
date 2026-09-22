import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { passwordMatches } from '@/lib/accountGuard';
import { issueToken } from '@/lib/issueToken';
import { emailChangedMail } from '@/lib/authMail';
import { sendMail } from '@/lib/mailer';
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
 * ## Why this needs no new table
 *
 * The usual shape is a `pendingEmail` column: the new address is parked there,
 * a token is mailed to it, and confirming moves it across. That is a migration
 * and a second verification path for a household cookbook with five accounts
 * in it.
 *
 * This does the same work with what is already here. The address is changed at
 * once, `emailVerifiedAt` is cleared, and the *existing* verification mail is
 * sent to the new address — the same one registration sends, read by the same
 * route, shown by the same banner that already sits above every page until an
 * address is confirmed. A typo therefore leaves you signed in, unverified, and
 * able to correct it, which is the same place the parked-column version leaves
 * you, minus a column.
 *
 * ## Why the old address is told first
 *
 * An address quietly changed to somebody else's is how an account stops being
 * yours. The password is asked for, and the address that is losing the account
 * is told before it loses it — so the one person who would want to know finds
 * out while they can still do something about it. Sent before the change, not
 * after, because after the change there is nowhere left to send it.
 *
 * Mail failing does not fail the change: this cookbook runs without mail
 * configured at all, and refusing to let somebody fix their own address
 * because a Gmail app password expired would be the wrong way round.
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

    if (me.email === email) {
        return NextResponse.json({ ok: true, unchanged: true });
    }

    // Told while there is still somewhere to tell. A notice, not a token:
    // nothing about it is meant to be pressed. Fire and forget — see above.
    void sendMail(emailChangedMail(me.email, me.name, email, locale)).catch((error) =>
        failed('account/email: notice to the old address', error)
    );

    try {
        await prisma.user.update({
            where: { id: auth.user.id },
            data: { email, emailVerifiedAt: null },
        });
    } catch (error) {
        // Almost always the unique index: somebody else has that address.
        return NextResponse.json({ message: describeWriteFailure(error) }, { status: 409 });
    }

    void issueToken({ ...me, email }, 'verify', locale).catch((error) =>
        failed('account/email: confirmation to the new address', error)
    );

    return NextResponse.json({ ok: true });
}
