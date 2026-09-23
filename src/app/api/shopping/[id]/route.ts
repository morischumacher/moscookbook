import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { idFrom, refuse, route } from '@/lib/route';
import { activeList } from '@/lib/shoppingDb';

/** One line: tick it off, or take it off. Only on the list the person shops on. */

const patchBody = z.object({ checked: z.boolean() });

export const PATCH = route<'user', typeof patchBody, { id: string }>(
    { access: 'user', body: patchBody, label: 'Ticking a shopping item' },
    async ({ user, params, body }) => {
        const id = idFrom(params.id, 'item');
        const list = await activeList(user.id);
        const updated = await prisma.shoppingItem.updateMany({
            where: { id, listId: list.id },
            data: { checked: body.checked },
        });
        if (updated.count !== 1) refuse(404, 'That item is gone.');
        return NextResponse.json({ id, checked: body.checked });
    }
);

export const DELETE = route<'user', undefined, { id: string }>(
    { access: 'user', label: 'Removing a shopping item' },
    async ({ user, params }) => {
        const id = idFrom(params.id, 'item');
        const list = await activeList(user.id);
        await prisma.shoppingItem.deleteMany({ where: { id, listId: list.id } });
        return NextResponse.json({ id, removed: true });
    }
);
