import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { idFrom, route } from '@/lib/route';
import { generateShareToken } from '@/lib/shareToken';

/**
 * A link to the menu card for the guests: no account, only the card — dish
 * names, not the recipes behind them. Withdrawing it stops the link at once.
 */
type Params = { id: string };

export const POST = route<'admin', undefined, Params>({ access: 'admin', label: 'Sharing a menu' }, async ({ params }) => {
    const id = idFrom(params.id, 'menu');
    const menu = await prisma.menu.findUnique({ where: { id }, select: { shareToken: true } });
    if (menu?.shareToken) return NextResponse.json({ shareToken: menu.shareToken });
    const updated = await prisma.menu.update({ where: { id }, data: { shareToken: generateShareToken() }, select: { shareToken: true } });
    return NextResponse.json(updated);
});

export const DELETE = route<'admin', undefined, Params>({ access: 'admin', label: 'Unsharing a menu' }, async ({ params }) => {
    await prisma.menu.updateMany({ where: { id: idFrom(params.id, 'menu') }, data: { shareToken: null } });
    return NextResponse.json({ shareToken: null });
});
