import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';
import { ownerId, protectionOf } from '@/lib/userProtection';

const roleSchema = z.object({
    admin: z.boolean(),
});

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await params;
        const userId = positiveIntId(id);

        if (userId === null) {
            return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
        }

        const parsed = roleSchema.safeParse(await req.json().catch(() => null));

        if (!parsed.success) {
            return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
        }

        const { admin } = parsed.data;

        // Taking rights away: never from yourself, never from the owner,
        // never from the last admin. See lib/userProtection.
        if (!admin) {
            const [owner, admins] = await Promise.all([ownerId(), prisma.user.count({ where: { admin: true } })]);
            const protectedAs = protectionOf(userId, auth.user.id, owner, admins);
            if (protectedAs) {
                return NextResponse.json(
                    {
                        message:
                            protectedAs === 'self'
                                ? 'Cannot revoke your own admin privileges.'
                                : protectedAs === 'owner'
                                  ? 'The owner of the cookbook keeps their admin rights.'
                                  : 'The cookbook needs at least one admin.',
                    },
                    { status: 403 }
                );
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { admin },
            select: { id: true, name: true, email: true, admin: true },
        });

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        failed('Update role error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
