import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { generateShareToken } from '@/lib/shareToken';
import { listOf } from '@/lib/shoppingDb';

/**
 * A link to the list for whoever is going to the shop. Anybody holding it can
 * see the list and tick things off — nothing else. Withdrawing it makes a new
 * one necessary; the old link stops working at once.
 */

export const POST = route({ access: 'user', label: 'Sharing the shopping list' }, async ({ user }) => {
    const list = await listOf(user.id);
    if (list.shareToken) return NextResponse.json({ shareToken: list.shareToken });

    const updated = await prisma.shoppingList.update({
        where: { id: list.id },
        data: { shareToken: generateShareToken() },
        select: { shareToken: true },
    });
    return NextResponse.json({ shareToken: updated.shareToken });
});

export const DELETE = route({ access: 'user', label: 'Unsharing the shopping list' }, async ({ user }) => {
    const list = await listOf(user.id);
    await prisma.shoppingList.update({ where: { id: list.id }, data: { shareToken: null } });
    return NextResponse.json({ shareToken: null });
});
