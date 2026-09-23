import { NextResponse } from 'next/server';
import { z } from 'zod';
import { refuse, route } from '@/lib/route';
import { activeList, collectionLines, itemsOf, recipeLines, removeLines, removeSource } from '@/lib/shoppingDb';
import { menuLines } from '@/lib/menuDb';

const body = z.union([
    z.object({ recipeId: z.number().int().positive().max(2_147_483_647), servings: z.number().int().min(1).max(100).nullable().optional(), locale: z.enum(['de', 'en']).optional() }),
    z.object({ collectionId: z.number().int().positive().max(2_147_483_647), locale: z.enum(['de', 'en']).optional() }),
    z.object({ menuId: z.number().int().positive().max(2_147_483_647) }),
    z.object({ source: z.string().trim().min(1).max(300) }),
]);

/**
 * "Wieder entfernen": what the add button just put on the list, taken off
 * again — the same lines, subtracted. See `removeFrom` in lib/shopping.
 *
 * `{ source }` is the list's own "Rezept entfernen": everything a recipe put
 * on the list, by its name under the lines. See `removeSource`.
 */
export const POST = route({ access: 'user', body, label: 'Taking lines off the shopping list' }, async ({ user, body }) => {
    const list = await activeList(user.id);
    if ('source' in body) {
        const changed = await removeSource(list.id, body.source);
        return NextResponse.json({ changed, items: await itemsOf(list.id) });
    }

    const lines =
        'recipeId' in body
            ? await recipeLines(body.recipeId, body.servings ?? null, body.locale, user)
            : 'collectionId' in body
              ? await collectionLines(body.collectionId, body.locale)
              : await menuLines(body.menuId);
    if (lines === null) refuse(404, 'That is no longer there.');

    const changed = await removeLines(list.id, lines);
    return NextResponse.json({ changed, items: await itemsOf(list.id) });
});
