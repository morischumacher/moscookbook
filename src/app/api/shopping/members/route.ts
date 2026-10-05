import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { householdOf } from '@/lib/shoppingDb';
import { requestedList } from '@/lib/shoppingRequest';

/**
 * Who is on a list (`?list=<id>`, the main list without it). Its owner invites
 * people of the cookbook, who get it among their lists once they accept
 * (/api/shopping/invitations).
 *
 * GET: who is on it, and for the owner up to eight people who could be
 *   invited whose name matches `&q=` (nobody without a search: with a
 *   hundred people in the cookbook a full list is a wall).
 * POST `{userId}`: the owner invites somebody.
 * DELETE `&userId=`: the owner takes somebody off (or withdraws an invitation).
 * DELETE `&leave=1`: somebody who joined leaves it.
 */

export const GET = route({ access: 'user', label: 'Shopping list members' }, async ({ req, user }) => {
    const list = await requestedList(req, user.id);
    const household = await householdOf(list.id);
    if (!household) refuse(404, 'This list is not there.');

    let people: { id: number; name: string; avatarUrl: string | null }[] = [];
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
    if (list.owner && q) {
        const taken = new Set([household.owner.id, ...household.members.map((m) => m.id), ...household.invited.map((m) => m.id)]);
        const everyone = await prisma.user.findMany({
            where: {
                id: { notIn: [...taken] },
                OR: [{ name: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }],
            },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, firstName: true, avatarUrl: true },
            take: 8,
        });
        people = everyone.map((p) => ({ id: p.id, name: p.firstName || p.name, avatarUrl: p.avatarUrl }));
    }
    return NextResponse.json({ owner: list.owner, household, people });
});

const inviteBody = z.object({ userId: z.number().int().positive().max(2_147_483_647) });

export const POST = route({ access: 'user', body: inviteBody, label: 'Inviting somebody to a shopping list' }, async ({ req, user, body }) => {
    const list = await requestedList(req, user.id, 'owner');
    if (body.userId === user.id) refuse(400, 'That is your own list.');
    const other = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
    if (!other) refuse(404, 'There is nobody by that name here.');

    await prisma.shoppingListMember.upsert({
        where: { listId_userId: { listId: list.id, userId: body.userId } },
        create: { listId: list.id, userId: body.userId },
        update: {},
    });
    return NextResponse.json({ invited: body.userId });
});

export const DELETE = route({ access: 'user', label: 'Taking somebody off a shopping list' }, async ({ req, user }) => {
    const query = new URL(req.url).searchParams;

    if (query.get('leave')) {
        const list = await requestedList(req, user.id);
        if (list.owner) refuse(400, 'This is your own list.');
        await prisma.$transaction([
            prisma.shoppingListMember.deleteMany({ where: { listId: list.id, userId: user.id } }),
            // What they had said they would buy is open again.
            prisma.shoppingItem.updateMany({ where: { listId: list.id, buyerId: user.id }, data: { buyerId: null } }),
        ]);
        return NextResponse.json({ left: true });
    }

    const list = await requestedList(req, user.id, 'owner');
    const userId = Number(query.get('userId'));
    if (!Number.isInteger(userId) || userId <= 0 || userId > 2_147_483_647) refuse(400, 'Take off whom?');
    await prisma.$transaction([
        prisma.shoppingListMember.deleteMany({ where: { listId: list.id, userId } }),
        prisma.shoppingItem.updateMany({ where: { listId: list.id, buyerId: userId }, data: { buyerId: null } }),
    ]);
    return NextResponse.json({ removed: userId });
});
