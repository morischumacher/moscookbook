import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { failed } from '@/lib/reportServerError';
import { ownerId, protectionOf } from '@/lib/userProtection';

/** What the list needs about one person. Annotated: no generated client. */
interface UserRow {
    id: number;
    name: string;
    email: string;
    admin: boolean;
    emailVerifiedAt: Date | null;
    invitesUsed: { usedAt: Date | null; createdBy: { name: string } | null }[];
}

export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const users: UserRow[] = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                admin: true,
                emailVerifiedAt: true,
                /*
                 * Who let this person in, and when.
                 *
                 * It used to be readable only from the invitation list, where
                 * every spent invitation sat for ever as a row saying "used by
                 * …" — a log kept in the place people go to *make* one, which
                 * is why that list was mostly history. The fact belongs to the
                 * person, so it is read with the person, and the invitation
                 * list is now only what is still open.
                 *
                 * An array because the relation is one, though at most one row
                 * can ever be in it: an invitation is spent when it is used.
                 */
                invitesUsed: {
                    select: { usedAt: true, createdBy: { select: { name: true } } },
                    take: 1,
                },
            },
            orderBy: { id: 'desc' },
        });

        const owner = await ownerId();
        const admins = users.filter((user) => user.admin).length;

        return NextResponse.json({
            users: users.map((user) => ({
                // Why the list offers no buttons on this row, if it does not.
                protectedAs: user.admin ? protectionOf(user.id, auth.user.id, owner, admins) : user.id === auth.user.id ? 'self' : null,
                id: user.id,
                name: user.name,
                email: user.email,
                admin: user.admin,
                verified: user.emailVerifiedAt !== null,
                invitedBy: user.invitesUsed[0]?.createdBy?.name ?? null,
                joinedAt: user.invitesUsed[0]?.usedAt ?? null,
            })),
        });
    } catch (error) {
        failed('Fetch users error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
