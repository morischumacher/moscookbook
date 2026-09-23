import { NextResponse } from 'next/server';
import { z } from 'zod';
import { refuse, route } from '@/lib/route';
import { collectionLines, itemsOf, listOf, recipeLines, removeLines } from '@/lib/shoppingDb';
import { menuLines } from '@/lib/menuDb';

const body = z.union([
    z.object({ recipeId: z.number().int().positive(), servings: z.number().int().min(1).max(100).nullable().optional(), locale: z.enum(['de', 'en']).optional() }),
    z.object({ collectionId: z.number().int().positive(), locale: z.enum(['de', 'en']).optional() }),
    z.object({ menuId: z.number().int().positive() }),
]);

/**
 * "Wieder entfernen": what the add button just put on the list, taken off
 * again — the same lines, subtracted. See `removeFrom` in lib/shopping.
 */
export const POST = route({ access: 'user', body, label: 'Taking lines off the shopping list' }, async ({ user, body }) => {
    const lines =
        'recipeId' in body
            ? await recipeLines(body.recipeId, body.servings ?? null, body.locale, user)
            : 'collectionId' in body
              ? await collectionLines(body.collectionId, body.locale)
              : await menuLines(body.menuId);
    if (lines === null) refuse(404, 'That is no longer there.');

    const list = await listOf(user.id);
    const changed = await removeLines(list.id, lines);
    return NextResponse.json({ changed, items: await itemsOf(list.id) });
});
