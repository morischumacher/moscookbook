import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { idFrom, refuse, route } from '@/lib/route';
import { reachableBy } from '@/lib/shoppingDb';

/**
 * One line: tick it off, say who is buying it, or take it off. Only on the
 * person's own lists and the ones they joined.
 */

const patchBody = z
    .object({
        checked: z.boolean().optional(),
        // Somebody on the list (its owner or who joined it), or null for nobody.
        buyerId: z.number().int().positive().max(2_147_483_647).nullable().optional(),
    })
    .refine((body) => body.checked !== undefined || body.buyerId !== undefined, 'Nothing to change.');

export const PATCH = route<'user', typeof patchBody, { id: string }>(
    { access: 'user', body: patchBody, label: 'Ticking a shopping item' },
    async ({ user, params, body }) => {
        const id = idFrom(params.id, 'item');
        const item = await prisma.shoppingItem.findFirst({ where: { id, list: reachableBy(user.id) }, select: { listId: true } });
        if (!item) refuse(404, 'That item is gone.');
        if (body.buyerId) {
            const onList = await prisma.shoppingList.count({ where: { id: item.listId, ...reachableBy(body.buyerId) } });
            if (onList !== 1) refuse(400, 'That person is not on this list.');
        }
        const updated = await prisma.shoppingItem.updateMany({
            where: { id, listId: item.listId },
            data: { checked: body.checked, buyerId: body.buyerId },
        });
        if (updated.count !== 1) refuse(404, 'That item is gone.');
        return NextResponse.json({ id, checked: body.checked, buyerId: body.buyerId });
    }
);

export const DELETE = route<'user', undefined, { id: string }>(
    { access: 'user', label: 'Removing a shopping item' },
    async ({ user, params }) => {
        const id = idFrom(params.id, 'item');
        await prisma.shoppingItem.deleteMany({ where: { id, list: reachableBy(user.id) } });
        return NextResponse.json({ id, removed: true });
    }
);
