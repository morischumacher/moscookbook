import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { idFrom, refuse, route } from '@/lib/route';

/** One line: tick it off, or take it off. Only on the person's own list. */

const patchBody = z.object({ checked: z.boolean() });

export const PATCH = route<'user', typeof patchBody, { id: string }>(
    { access: 'user', body: patchBody, label: 'Ticking a shopping item' },
    async ({ user, params, body }) => {
        const id = idFrom(params.id, 'item');
        const updated = await prisma.shoppingItem.updateMany({
            where: { id, list: { userId: user.id } },
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
        await prisma.shoppingItem.deleteMany({ where: { id, list: { userId: user.id } } });
        return NextResponse.json({ id, removed: true });
    }
);
