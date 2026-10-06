import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { itemsOf, knownUnits, simplifyLines } from '@/lib/shoppingDb';
import { requestedList } from '@/lib/shoppingRequest';
import { learnConversions, type Missing } from '@/lib/ingredientUnitsDb';
import { factorBetween } from '@/lib/ingredientUnits';

/**
 * "Vereinfachen": every ingredient on the list that is there in several
 * units — "14 Frühlingszwiebeln" and "2 Bund Frühlingszwiebeln" — made one
 * line, in the unit it is bought in. How much is for which recipe goes along
 * (lib/shoppingParts), so taking a recipe off later needs nobody.
 *
 * Only for the admin. How one unit is in another comes from the ingredient
 * (admin → Zutaten), the defaults for the common ones, or the AI when it is
 * on, asked once per ingredient and remembered on it. (Adding to a list
 * combines what is already known for everybody — that asks nobody.) Whatever is still not known
 * stays as it is and is named in the answer.
 */
export const POST = route({ access: 'admin', label: 'Simplifying the shopping list' }, async ({ req, user }) => {
    const list = await requestedList(req, user.id);

    // What is missing, asked before the list is locked: the AI takes seconds.
    // Admins only (the route's access): the AI is paid for by the admin.
    let learned = 0;
    const missing = await missingUnits(list.id);
    if (missing.length > 0) learned = await learnConversions(missing);

    const result = await prisma.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT id FROM "ShoppingList" WHERE id = ${list.id} FOR UPDATE`;
            const done = await simplifyLines(tx, list.id, null, async (_, __, units) => units);
            await tx.shoppingList.update({ where: { id: list.id }, data: { updatedAt: new Date() } });
            return done;
        },
        { timeout: 20_000 }
    );

    return NextResponse.json({ merged: result.merged, learned, unresolved: result.unresolved.map((group) => group.name), items: await itemsOf(list.id) });
});

/** The ingredients on the list in several units with no known way from one to the other. */
async function missingUnits(listId: number): Promise<Missing[]> {
    const lines = await prisma.shoppingItem.findMany({ where: { listId, checked: false, itemId: { not: null } }, select: { itemId: true, measure: true } });
    const measures = new Map<number, Set<string>>();
    for (const line of lines) {
        if (line.measure === null) continue;
        measures.set(line.itemId!, (measures.get(line.itemId!) ?? new Set()).add(line.measure));
    }
    const several = [...measures].filter(([, set]) => set.size > 1);
    if (several.length === 0) return [];
    const known = await knownUnits(prisma, several.map(([itemId]) => itemId));
    return several
        .map(([itemId, set]) => ({ itemId, name: known.get(itemId)?.name ?? '', measures: [...set], units: known.get(itemId)?.units ?? null }))
        .filter((group) => group.name && (!group.units || group.measures.some((measure) => factorBetween(measure, group.units!.buy, group.units) === null)));
}
