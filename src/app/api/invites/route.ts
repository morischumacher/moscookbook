import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { generateInviteCode, inviteExpiryFromNow, inviteState, INVITE_VALID_DAYS } from '@/lib/invite';

const createSchema = z.object({
    note: z.string().trim().max(200).default(''),
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
        const invites: InviteRow[] = await prisma.invite.findMany({
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
        console.error('List invites error:', error);
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

        const invite = await prisma.invite.create({
            data: {
                code: generateInviteCode(),
                note: parsed.data.note || null,
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
        console.error('Create invite error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
