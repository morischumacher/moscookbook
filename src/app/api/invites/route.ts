import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { generateInviteCode, inviteExpiryFromNow, inviteState, INVITE_VALID_DAYS } from '@/lib/invite';
import { failed } from '@/lib/reportServerError';
import { checkName } from '@/lib/inviteName';
import { takenNames } from '@/lib/inviteNameDb';

const createSchema = z.object({
    note: z.string().trim().max(200).default(''),
    /** Who it is for; fixed in the registration form. See lib/inviteName. */
    firstName: z.string().trim().min(1, 'First name is required').max(80),
    lastName: z.string().trim().max(80).default(''),
    days: z.number().int().min(1).max(365).default(INVITE_VALID_DAYS),
});

interface InviteRow {
    id: number;
    code: string;
    note: string | null;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
    usedBy: { email: string } | null;
}

export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        /*
         * Only the invitations that are still worth something.
         *
         * A spent one is not an invitation, it is a record of one — and as a
         * record it was in the wrong place: this is the list you come to in
         * order to *make* an invitation, and it was three-quarters history.
         * Who invited whom now sits on the person it is about, in the list
         * above this one.
         *
         * Expired ones stay. They are still rows somebody may want to revoke
         * or reissue, and unlike a spent one they represent something that
         * never happened.
         */
        const invites: InviteRow[] = await prisma.invite.findMany({
            where: { usedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                id: true,
                code: true,
                note: true,
                createdAt: true,
                expiresAt: true,
                usedAt: true,
                usedBy: { select: { email: true } },
            },
        });

        return NextResponse.json({
            invites: invites.map((invite) => ({
                id: invite.id,
                code: invite.code,
                note: invite.note,
                createdAt: invite.createdAt,
                expiresAt: invite.expiresAt,
                usedAt: invite.usedAt,
                state: inviteState(invite),
                usedByEmail: invite.usedBy?.email ?? null,
            })),
        });
    } catch (error) {
        failed('List invites error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
        }

        const { firstName, lastName } = parsed.data;
        const clash = checkName({ firstName, lastName }, await takenNames());
        if (clash.state !== 'free') {
            return NextResponse.json({ message: 'That name is already taken.', ...clash }, { status: 409 });
        }

        const invite = await prisma.invite.create({
            data: {
                code: generateInviteCode(),
                note: parsed.data.note || [firstName, lastName].filter(Boolean).join(' '),
                firstName,
                lastName: lastName || null,
                expiresAt: inviteExpiryFromNow(parsed.data.days),
                createdById: auth.user.id,
            },
            select: { id: true, code: true, note: true, createdAt: true, expiresAt: true, usedAt: true },
        });

        return NextResponse.json(
            { invite: { ...invite, state: 'valid', usedByEmail: null } },
            { status: 201 }
        );
    } catch (error) {
        failed('Create invite error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
