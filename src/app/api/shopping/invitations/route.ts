import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';

/**
 * Answering an invitation to somebody's shopping list. Accepting puts the list
 * among this person's lists; declining just removes the invitation.
 */

const body = z.object({ listId: z.number().int().positive().max(2_147_483_647), accept: z.boolean() });

export const POST = route({ access: 'user', body, label: 'Answering a shopping list invitation' }, async ({ user, body }) => {
    if (!body.accept) {
        await prisma.shoppingListMember.deleteMany({ where: { listId: body.listId, userId: user.id, acceptedAt: null } });
        return NextResponse.json({ declined: true });
    }
    const joined = await prisma.shoppingListMember.updateMany({
        where: { listId: body.listId, userId: user.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
    });
    if (joined.count !== 1) refuse(404, 'This invitation is no longer there.');
    return NextResponse.json({ joined: body.listId });
});
