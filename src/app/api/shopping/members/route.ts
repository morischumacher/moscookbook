import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { listOf } from '@/lib/shoppingDb';

/**
 * Who the shopping list is shared with, among the people of the cookbook.
 * They see it beside their own list and can add, tick and remove lines.
 *
 * GET and POST/DELETE with `userId` are the owner's. DELETE with `?list=<id>`
 * is a member leaving a list somebody else shared with them.
 */

const person = { id: true, name: true, firstName: true } as const;

export const GET = route({ access: 'user', label: 'Shopping list members' }, async ({ user }) => {
    const list = await listOf(user.id);
    const [members, people] = await Promise.all([
        prisma.shoppingListMember.findMany({ where: { listId: list.id }, select: { userId: true } }),
        prisma.user.findMany({ where: { id: { not: user.id } }, orderBy: { name: 'asc' }, select: person, take: 200 }),
    ]);
    const chosen = new Set(members.map((member) => member.userId));
    return NextResponse.json({
        people: people.map((p) => ({ id: p.id, name: p.name || p.firstName, member: chosen.has(p.id) })),
    });
});

const addBody = z.object({ userId: z.number().int().positive().max(2_147_483_647) });

export const POST = route({ access: 'user', body: addBody, label: 'Sharing the shopping list with somebody' }, async ({ user, body }) => {
    if (body.userId === user.id) refuse(400, 'That is your own list.');
    const other = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
    if (!other) refuse(404, 'There is nobody by that name here.');

    const list = await listOf(user.id);
    await prisma.shoppingListMember.upsert({
        where: { listId_userId: { listId: list.id, userId: body.userId } },
        create: { listId: list.id, userId: body.userId },
        update: {},
    });
    return NextResponse.json({ userId: body.userId, member: true });
});

export const DELETE = route({ access: 'user', label: 'Unsharing the shopping list with somebody' }, async ({ req, user }) => {
    const query = new URL(req.url).searchParams;
    const leaving = query.get('list');
    if (leaving) {
        if (!/^\d{1,9}$/.test(leaving)) refuse(404, 'This list is not shared with you.');
        await prisma.shoppingListMember.deleteMany({ where: { listId: Number(leaving), userId: user.id } });
        return NextResponse.json({ left: true });
    }

    const userId = Number(query.get('userId'));
    if (!Number.isInteger(userId) || userId <= 0 || userId > 2_147_483_647) refuse(400, 'Unshare with whom?');
    const list = await listOf(user.id);
    await prisma.shoppingListMember.deleteMany({ where: { listId: list.id, userId } });
    return NextResponse.json({ userId, member: false });
});
