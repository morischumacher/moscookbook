import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { listsOf } from '@/lib/shoppingDb';
import { requestedList } from '@/lib/shoppingRequest';

/**
 * A person's lists. The main list is always there and cannot be renamed or
 * deleted; more lists are made with a name ("Grillparty Samstag"), and each
 * is private until it is shared on its own.
 *
 * GET: every list this person can open. POST `{name}`: a new list.
 * PATCH `?list=<id>` `{name}`: renamed. DELETE `?list=<id>`: gone, with its lines.
 */

const MAX_LISTS = 20;
const nameBody = z.object({ name: z.string().trim().min(1).max(60) });

export const GET = route({ access: 'user', label: 'Shopping lists' }, async ({ user }) => {
    return NextResponse.json({ lists: await listsOf(user.id) });
});

export const POST = route({ access: 'user', body: nameBody, label: 'Making a shopping list' }, async ({ user, body }) => {
    const count = await prisma.shoppingList.count({ where: { userId: user.id } });
    if (count >= MAX_LISTS) refuse(409, 'That is a lot of lists. Delete one first.');
    const list = await prisma.shoppingList.create({ data: { userId: user.id, name: body.name }, select: { id: true } });
    return NextResponse.json({ id: list.id });
});

export const PATCH = route({ access: 'user', body: nameBody, label: 'Renaming a shopping list' }, async ({ req, user, body }) => {
    const list = await requestedList(req, user.id, 'owner');
    if (list.name === null) refuse(400, 'The main list keeps its name.');
    await prisma.shoppingList.update({ where: { id: list.id }, data: { name: body.name } });
    return NextResponse.json({ id: list.id, name: body.name });
});

export const DELETE = route({ access: 'user', label: 'Deleting a shopping list' }, async ({ req, user }) => {
    if (!new URL(req.url).searchParams.get('list')) refuse(400, 'Delete which list?');
    const list = await requestedList(req, user.id, 'owner');
    if (list.name === null) refuse(400, 'The main list cannot be deleted. Empty it instead.');
    await prisma.shoppingList.delete({ where: { id: list.id } });
    return NextResponse.json({ deleted: list.id });
});
