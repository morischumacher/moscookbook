import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { joinList } from '@/lib/shoppingDb';

/**
 * Answering an invitation to somebody's shopping list. Accepting makes it the
 * list this person shops on, and brings what was on their own list along;
 * declining just removes the invitation.
 */

const body = z.object({ listId: z.number().int().positive().max(2_147_483_647), accept: z.boolean() });

export const POST = route({ access: 'user', body, label: 'Answering a shopping list invitation' }, async ({ user, body }) => {
    if (!body.accept) {
        await prisma.shoppingListMember.deleteMany({ where: { listId: body.listId, userId: user.id, acceptedAt: null } });
        return NextResponse.json({ declined: true });
    }

    const outcome = await joinList(user.id, body.listId);
    if (outcome === 'notInvited') refuse(404, 'This invitation is no longer there.');
    if (outcome === 'alreadyJoined') refuse(409, 'You already shop on another list. Leave it first.');
    if (outcome === 'hosting') refuse(409, 'Others shop on your list. Take them off it first.');
    return NextResponse.json({ joined: true });
});
