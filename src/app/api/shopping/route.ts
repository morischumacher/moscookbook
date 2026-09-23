import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { lineFromText } from '@/lib/shopping';
import { addLines, collectionLines, itemsOf, recipeLines } from '@/lib/shoppingDb';
import { requestedList } from '@/lib/shoppingRequest';
import { menuLines } from '@/lib/menuDb';

/**
 * The signed-in person's shopping list: read it, add to it, clear it.
 *
 * Adding takes one of three things — a recipe at the servings it was being
 * read at, a whole collection, or a line typed by hand — and the same
 * ingredient already on the list is added to rather than listed twice.
 *
 * `?list=<id>` picks one of the person's lists or one they joined; without it,
 * their main list.
 */

export const GET = route({ access: 'user', label: 'Shopping list' }, async ({ req, user }) => {
    const list = await requestedList(req, user.id);
    return NextResponse.json({ items: await itemsOf(list.id) });
});

const addBody = z.union([
    z.object({ recipeId: z.number().int().positive().max(2_147_483_647), servings: z.number().int().min(1).max(100).nullable().optional(), locale: z.enum(['de', 'en']).optional() }),
    z.object({ collectionId: z.number().int().positive().max(2_147_483_647), locale: z.enum(['de', 'en']).optional() }),
    z.object({ menuId: z.number().int().positive().max(2_147_483_647) }),
    z.object({ text: z.string().trim().min(1).max(200) }),
]);

export const POST = route({ access: 'user', body: addBody, label: 'Adding to the shopping list' }, async ({ req, user, body }) => {
    const lines =
        'recipeId' in body
            ? await recipeLines(body.recipeId, body.servings ?? null, body.locale, user)
            : 'collectionId' in body
              ? await collectionLines(body.collectionId, body.locale)
              : 'menuId' in body
                ? await menuLines(body.menuId)
                : [lineFromText(body.text)].filter((line) => line !== null);

    if (lines === null) refuse(404, 'That is no longer there.');

    const list = await requestedList(req, user.id);
    const changed = await addLines(list.id, lines);

    return NextResponse.json({ added: lines.length, changed, items: await itemsOf(list.id) });
});

/** `?which=checked` clears what was bought; `?which=all` empties the list. */
export const DELETE = route({ access: 'user', label: 'Clearing the shopping list' }, async ({ req, user }) => {
    const which = new URL(req.url).searchParams.get('which');
    if (which !== 'checked' && which !== 'all') refuse(400, 'Clear what?');

    const list = await requestedList(req, user.id);
    await prisma.shoppingItem.deleteMany({ where: { listId: list.id, ...(which === 'checked' ? { checked: true } : {}) } });

    return NextResponse.json({ items: await itemsOf(list.id) });
});
