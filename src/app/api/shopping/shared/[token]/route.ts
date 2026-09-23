import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { refuse, route } from '@/lib/route';
import { lineFromText } from '@/lib/shopping';
import { addLines, itemsOf } from '@/lib/shoppingDb';

/**
 * A shared shopping list, for somebody with the link and no account: read it,
 * tick a line, add a line ("we are out of milk"). Nothing can be deleted from
 * here, and nothing else of the owner's is reachable — the token opens this
 * one list.
 */

async function sharedList(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) refuse(404, 'This list is not shared.');
    const list = await prisma.shoppingList.findUnique({ where: { shareToken: token }, select: { id: true } });
    if (!list) refuse(404, 'This list is not shared.');
    return list;
}

type Params = { token: string };

export const GET = route<'public', undefined, Params>({ access: 'public', label: 'Shared shopping list' }, async ({ params }) => {
    const list = await sharedList(params.token);
    return NextResponse.json({ items: await itemsOf(list.id) });
});

const patchBody = z.object({ itemId: z.number().int().positive(), checked: z.boolean() });

export const PATCH = route<'public', typeof patchBody, Params>(
    { access: 'public', body: patchBody, label: 'Ticking a shared shopping item' },
    async ({ params, body }) => {
        const list = await sharedList(params.token);
        const updated = await prisma.shoppingItem.updateMany({
            where: { id: body.itemId, listId: list.id },
            data: { checked: body.checked },
        });
        if (updated.count !== 1) refuse(404, 'That item is gone.');
        return NextResponse.json({ id: body.itemId, checked: body.checked });
    }
);

const addBody = z.object({ text: z.string().trim().min(1).max(200) });

export const POST = route<'public', typeof addBody, Params>(
    { access: 'public', body: addBody, label: 'Adding to a shared shopping list' },
    async ({ req, params, body }) => {
        // Without an account, so limited by address: a link passed around
        // further than meant should not become a way to fill the list.
        const limit = await rateLimitShared(clientKey(req, 'shopping-shared'), 60, 10 * 60 * 1000);
        if (!limit.ok) refuse(429, 'Too many at once. Please wait a moment.');

        const list = await sharedList(params.token);
        const line = lineFromText(body.text);
        if (line) await addLines(list.id, [line]);
        return NextResponse.json({ items: await itemsOf(list.id) });
    }
);
