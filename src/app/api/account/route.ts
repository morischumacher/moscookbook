import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireUser } from '@/lib/auth';
import { getSession } from '@/lib/auth';
import { passwordMatches } from '@/lib/accountGuard';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { formatZodError } from '@/lib/zodMessage';
import { handOverLists } from '@/lib/shoppingDb';
import { isPrismaError } from '@/lib/prismaErrors';

const schema = z.object({
    password: z.string().min(1, 'Your password is required').max(200),
});

/**
 * Deleting your own account.
 *
 * An admin could delete anybody and nobody could delete themselves, which is
 * the wrong way round for the one account a person actually owns.
 *
 * What goes and what stays is the schema's decision, not this route's, and it
 * was made when each relation was written. Read off prisma/schema.prisma
 * rather than remembered, because getting this wrong in a comment is how
 * somebody later believes their ratings survived:
 *
 *   cascade   ratings, favourites, sign-in tokens, memberships of other
 *             people's shopping lists, and their own lists nobody else is on
 *   handed    their shopping lists somebody else shops on (handOverLists)
 *   set null  the cooking log, blog entries, tickets, the invitations this
 *             person created (migration 0052) and the one they used — the note and the photograph of a dish stay in the
 *             cookbook without a name on them, which is the point of that
 *             column being nullable
 *
 * Recipes are the household's, not any one person's, and have no author to
 * lose.
 *
 * ## The last admin
 *
 * Refused. An installation with no admin has no way to make one — there is no
 * sign-up, only invitations, and inviting is an admin's. The door would be
 * locked from the inside with everybody outside it, recoverable only by
 * somebody running `npm run create-admin` against the production database.
 * One sentence here is cheaper than that evening.
 */
export async function DELETE(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const limit = await rateLimitShared(`delete-account:${auth.user.id}`, 5, 60 * 60 * 1000);

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

    if (!(await passwordMatches(auth.user.id, parsed.data.password))) {
        return NextResponse.json({ message: 'That is not your password.' }, { status: 403 });
    }

    const me: { admin: boolean } | null = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { admin: true },
    });

    if (!me) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    /*
     * The check and the delete in one serializable transaction: two admins
     * deleting their accounts at the same moment each saw the other one and
     * left the cookbook with nobody who can let anyone in.
     */
    const gone = await prisma
        .$transaction(
            async (tx) => {
                if (me.admin && (await tx.user.count({ where: { admin: true, id: { not: auth.user.id } } })) === 0) return null;
                await handOverLists(tx, auth.user.id);
                return tx.user.delete({ where: { id: auth.user.id }, select: { avatarUrl: true } });
            },
            { isolationLevel: 'Serializable' }
        )
        .catch((error: unknown) => {
            // Serialization conflict: another account change went first.
            if (isPrismaError(error, 'P2034')) return 'retry' as const;
            throw error;
        });

    if (gone === 'retry') {
        return NextResponse.json({ message: 'That did not work.' }, { status: 409 });
    }
    if (!gone) {
        return NextResponse.json(
            {
                message:
                    'You are the only admin. Make somebody else an admin first, or this cookbook would have nobody who can let anyone in.',
            },
            { status: 409 }
        );
    }

    // The avatar is a file of its own, which the row going does not take.
    await deleteBlobs([gone.avatarUrl]);

    // The cookie outlives the row by a fortnight otherwise, and every page it
    // opens would be a lookup for a person who is not there.
    const session = await getSession();
    session.destroy();

    return NextResponse.json({ ok: true });
}
