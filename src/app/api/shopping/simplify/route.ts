import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { itemsOf, knownUnits, simplifyLines } from '@/lib/shoppingDb';
import { requestedList } from '@/lib/shoppingRequest';
import { isMeasure, type Units } from '@/lib/shoppingParts';
import { aiCapability } from '@/lib/aiConfig';
import { canUseAi, completeWithKey, extractJson } from '@/lib/aiImport';
import { usageRecorder } from '@/lib/tokenUsageDb';

/**
 * "Vereinfachen": every ingredient on the list that is there in several
 * units — "14 Frühlingszwiebeln" and "2 Bund Frühlingszwiebeln" — made one
 * line, in the unit it is bought in. How much is for which recipe goes along
 * (lib/shoppingParts), so taking a recipe off later needs nobody.
 *
 * How one unit is in another comes from the ingredient (admin → Zutaten), the
 * defaults for the common ones, or — for an admin, when the AI is on — the AI,
 * asked once per ingredient and remembered on it. Whatever is still not known
 * stays as it is and is named in the answer.
 */
export const POST = route({ access: 'user', label: 'Simplifying the shopping list' }, async ({ req, user }) => {
    const list = await requestedList(req, user.id);

    // What is missing, asked before the list is locked: the AI takes seconds.
    let learned = 0;
    if (user.admin) {
        const missing = await missingUnits(list.id);
        if (missing.length > 0) learned = await learn(missing);
    }

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

interface Missing {
    itemId: number;
    name: string;
    measures: string[];
    units: Units | null;
}

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
        .filter((group) => group.name && (!group.units || group.measures.some((measure) => measure !== group.units!.buy && !group.units!.factors[measure])));
}

const answerShape = z.object({
    items: z
        .array(z.object({ id: z.number(), buy: z.string(), factors: z.record(z.string(), z.number()) }))
        .default([]),
});

/** The AI asked once for all of them; what it says is kept on each ingredient. Returns how many it taught. */
async function learn(missing: Missing[]): Promise<number> {
    const ai = await aiCapability();
    if (!canUseAi(ai)) return 0;
    const usage = usageRecorder('ingredients');
    const text = missing
        .slice(0, 40)
        .map((group) => `${group.itemId}: ${group.name} | on the list as: ${group.measures.join(', ')}${group.units ? ` | bought in: ${group.units.buy}` : ''}`)
        .join('\n');
    try {
        let answer: z.infer<typeof answerShape> | null = null;
        for (const key of ai.keys) {
            try {
                const parsed = answerShape.safeParse(extractJson(await completeWithKey(key, { kind: 'raw', system: UNITS_PROMPT, text }, usage.report)));
                if (parsed.success) {
                    answer = parsed.data;
                    break;
                }
            } catch {
                // The next key, if there is one.
            }
        }
        if (!answer) return 0;

        let taught = 0;
        for (const row of answer.items) {
            const group = missing.find((candidate) => candidate.itemId === row.id);
            // Its buy unit stays where one was already known: only the factors are learned.
            const buy = group?.units?.buy ?? row.buy;
            if (!group || !isMeasure(buy)) continue;
            const factors = Object.fromEntries(Object.entries(row.factors).filter(([measure, factor]) => isMeasure(measure) && measure !== buy && factor > 0 && factor < 100_000));
            if (Object.keys(factors).length === 0) continue;
            const item = await prisma.ingredientItem.findUnique({ where: { id: row.id }, select: { buyMeasure: true, factors: true } });
            if (!item) continue;
            const own = item.buyMeasure === buy && item.factors && typeof item.factors === 'object' ? (item.factors as Record<string, number>) : {};
            await prisma.ingredientItem.update({
                where: { id: row.id },
                data: { buyMeasure: buy, factors: { ...(group.units?.factors ?? {}), ...own, ...factors } as Prisma.InputJsonValue },
            });
            taught += 1;
        }
        return taught;
    } finally {
        await usage.flush();
    }
}

const UNITS_PROMPT = `You help a German/English cookbook's shopping list put one ingredient's amounts into one unit.

You receive lines "id: ingredient | on the list as: measure, measure | bought in: measure" (the last part only when it is already known).

Measures:
- "mass": grams
- "volume": millilitres
- "spoon": millilitres measured with spoons (1 tablespoon = 15, 1 teaspoon = 5)
- "count:": pieces ("3 onions")
- "count:<unit>": pieces of that unit, German unit words: "count:bund" (bunch), "count:zehe" (clove), "count:dose" (can), "count:scheibe" (slice), "count:prise" (pinch), "count:stange" (stalk), "count:knolle" (bulb), "count:packung" (pack), "count:handvoll" (handful)

For each ingredient choose the measure it is usually bought in at a German supermarket ("buy") — keep the given one when there is one — and for every other measure on its line, how much of "buy" ONE of it is ("factors"). Typical average sizes; rough is fine.

Example: spring onions on the list as "count:, count:bund, mass" → {"id": 7, "buy": "count:bund", "factors": {"count:": 0.143, "mass": 0.01}} (seven to a bunch, a bunch about 100 g).

Return JSON only: {"items": [{"id": n, "buy": "…", "factors": {"measure": number, …}}, …]}. Leave out an ingredient whose units cannot sensibly be converted. No explanation, no code fences.`;
