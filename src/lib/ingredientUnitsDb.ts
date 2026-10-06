import prisma from './prisma';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { commonIngredient } from './ingredientNames';
import { isMeasure, unitsOf, type Units } from './shoppingParts';
import { convertQuantity, familyOf, measureOf, missingConversions, unitKey, unitLabel, unitState, type UnitState, type UnitUse } from './ingredientUnits';
import { formatAmount, splitAmount } from './ingredientParts';
import { rewriteRows } from './recipeRowsDb';
import { aiCapability } from './aiConfig';
import { canUseAi, completeWithKey, extractJson } from './aiImport';
import { usageRecorder } from './tokenUsageDb';

/**
 * The ingredients' units as the database has them (lib/ingredientUnits for
 * the rules): which units their recipe rows use, which ingredients are in a
 * conflict, and which conversions the shopping list still lacks — gathered
 * up until the admin has the AI fill them in, with one tap on admin → Zutaten
 * ("KI-Umrechnungen berechnen"). Nothing here asks an AI by itself.
 */

/** What the AI was already asked, per ingredient: the kinds it was shown. Not asked again for the same. */
const ASKED = 'ingredients.unitsAsked';

/** When the gathered conversions are worth a tap: this many, or one waiting this long. */
export const DUE_COUNT = 5;
const DUE_AGE = 14 * 24 * 3600_000;

/** Every ingredient's recipe rows, counted by unit (its stored form); without one recipe's, when given. */
export async function unitUses(withoutRecipe?: number): Promise<Map<number, UnitUse[]>> {
    const groups = await prisma.ingredient.groupBy({
        by: ['itemId', 'unit'],
        where: { itemId: { not: null }, ...(withoutRecipe !== undefined ? { recipeId: { not: withoutRecipe } } : {}) },
        _count: { _all: true },
    });
    const uses = new Map<number, Map<string, number>>();
    for (const group of groups) {
        if (group.itemId === null) continue;
        const key = unitKey(group.unit);
        const mine = uses.get(group.itemId) ?? new Map<string, number>();
        mine.set(key, (mine.get(key) ?? 0) + group._count._all);
        uses.set(group.itemId, mine);
    }
    return new Map([...uses].map(([itemId, counts]) => [itemId, [...counts].map(([unit, count]) => ({ unit, count }))]));
}

async function asked(): Promise<Record<string, string>> {
    const row = await prisma.appSetting.findUnique({ where: { key: ASKED }, select: { value: true } }).catch(() => null);
    try {
        return JSON.parse(row?.value ?? '{}') as Record<string, string>;
    } catch {
        return {};
    }
}

const askedKey = (kinds: string[]) => [...kinds].sort().join(',');

export interface UnitOverview {
    state: UnitState;
    uses: UnitUse[];
    units: Units | null;
    /** Kinds the shopping list cannot yet turn into the buy unit, the AI not yet asked about. */
    missing: string[];
}

type ItemRow = { id: number; de: string; en: string; buyMeasure: string | null; factors: unknown; unit: string | null; moreUnits: string[]; createdAt: Date };

/** Every ingredient's units: its standard one, its conflicts, and what is still to convert. */
export async function unitOverview(items?: ItemRow[], withoutRecipe?: number): Promise<Map<number, UnitOverview>> {
    const [all, uses, done] = await Promise.all([
        items ??
            prisma.ingredientItem.findMany({ select: { id: true, de: true, en: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true } }),
        unitUses(withoutRecipe),
        asked(),
    ]);
    const overview = new Map<number, UnitOverview>();
    for (const item of all) {
        const mine = uses.get(item.id) ?? [];
        const state = unitState(item, mine);
        const units = unitsOf(item, commonIngredient(item.de)?.id ?? commonIngredient(item.en)?.id ?? null);
        const kinds = [...mine.map((use) => measureOf(use.unit)), ...(state.unit !== null ? [measureOf(state.unit)] : []), ...item.moreUnits].filter(
            (kind): kind is string => kind !== null
        );
        const open = missingConversions(kinds, units, state.unit);
        overview.set(item.id, { state, uses: mine, units, missing: open.length > 0 && done[String(item.id)] === askedKey(kinds) ? [] : open });
    }
    return overview;
}

/** What waits for the admin on admin → Zutaten: unit conflicts, and conversions for the AI (counted only once due). */
export async function ingredientTodo(): Promise<{ conflicts: number; conversions: number; due: boolean }> {
    const items = await prisma.ingredientItem.findMany({ select: { id: true, de: true, en: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true } });
    const overview = await unitOverview(items);
    let conflicts = 0;
    let conversions = 0;
    let oldest = Infinity;
    for (const item of items) {
        const entry = overview.get(item.id);
        if (!entry) continue;
        if (entry.state.odd.length > 0) conflicts += 1;
        if (entry.missing.length > 0) {
            conversions += 1;
            oldest = Math.min(oldest, item.createdAt.getTime());
        }
    }
    return { conflicts, conversions, due: conversions >= DUE_COUNT || (conversions > 0 && Date.now() - oldest > DUE_AGE) };
}

export interface Missing {
    itemId: number;
    name: string;
    measures: string[];
    units: Units | null;
}

const answerShape = z.object({
    items: z.array(z.object({ id: z.number(), buy: z.string(), factors: z.record(z.string(), z.number()) })).default([]),
});

/**
 * The AI asked once for all of them; what it says is kept on each
 * ingredient, and that it was asked is kept too, so an ingredient it could
 * not convert is not offered again. Returns how many it taught.
 */
export async function learnConversions(missing: Missing[]): Promise<number> {
    if (missing.length === 0) return 0;
    const ai = await aiCapability();
    if (!canUseAi(ai)) return 0;
    const usage = usageRecorder('ingredients');
    const batch = missing.slice(0, 40);
    const text = batch.map((group) => `${group.itemId}: ${group.name} | written as: ${group.measures.join(', ')}${group.units ? ` | bought in: ${group.units.buy}` : ''}`).join('\n');
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
            const group = batch.find((candidate) => candidate.itemId === row.id);
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
        // Asked, whatever the answer: "cannot be converted" is an answer too.
        const done = await asked();
        for (const group of batch) done[String(group.itemId)] = askedKey(group.measures);
        const value = JSON.stringify(done);
        await prisma.appSetting.upsert({ where: { key: ASKED }, update: { value }, create: { key: ASKED, value } });
        return taught;
    } finally {
        await usage.flush();
    }
}

/** Every gathered conversion, asked of the AI at once (40 ingredients a tap). Returns how many it taught and how many are left. */
export async function learnPending(): Promise<{ taught: number; left: number }> {
    const items = await prisma.ingredientItem.findMany({ select: { id: true, de: true, en: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true } });
    const overview = await unitOverview(items);
    const pending: Missing[] = items.flatMap((item) => {
        const entry = overview.get(item.id);
        if (!entry || entry.missing.length === 0) return [];
        const kinds = [...new Set([...entry.uses.map((use) => measureOf(use.unit)), ...(entry.state.unit !== null ? [measureOf(entry.state.unit)] : []), ...item.moreUnits])].filter(
            (kind): kind is string => kind !== null
        );
        return [{ itemId: item.id, name: item.de || item.en, measures: kinds, units: entry.units }];
    });
    const taught = await learnConversions(pending);
    return { taught, left: Math.max(0, pending.length - 40) };
}

const UNITS_PROMPT = `You help a German/English cookbook convert one ingredient's amounts from one unit into another.

You receive lines "id: ingredient | written as: measure, measure | bought in: measure" (the last part only when it is already known).

Measures:
- "mass": grams
- "volume": millilitres
- "spoon": millilitres measured with spoons (1 tablespoon = 15, 1 teaspoon = 5)
- "count:": pieces ("3 onions")
- "count:<unit>": pieces of that unit, German unit words: "count:bund" (bunch), "count:zehe" (clove), "count:dose" (can), "count:scheibe" (slice), "count:prise" (pinch), "count:stange" (stalk), "count:knolle" (bulb), "count:packung" (pack), "count:handvoll" (handful)

For each ingredient choose the measure it is usually bought in at a German supermarket ("buy") — keep the given one when there is one — and for every other measure on its line, how much of "buy" ONE of it is ("factors"). Typical average sizes; rough is fine.

Example: spring onions written as "count:, count:bund, mass" → {"id": 7, "buy": "count:bund", "factors": {"count:": 0.143, "mass": 0.01}} (seven to a bunch, a bunch about 100 g).

Return JSON only: {"items": [{"id": n, "buy": "…", "factors": {"measure": number, …}}, …]}. Leave out an ingredient whose units cannot sensibly be converted. No explanation, no code fences.`;

/**
 * A recipe just imported, written in the cookbook's standard units where
 * that is sure:
 *
 * - the same kind in another size: "0,5 kg Pasta" → "500 g" when Pasta is in g;
 * - another kind the ingredient is not written in, when the way is known:
 *   "14 Frühlingszwiebeln" → "2 Bund".
 *
 * A row in a kind allowed for the ingredient, with no number, or with no
 * known conversion stays as written — the last shows up on admin → Zutaten
 * as a conflict to decide. The standard units are read without this recipe,
 * so its own rows cannot outvote the cookbook. Returns whether it changed.
 */
export async function applyStandardUnits(recipeId: number): Promise<boolean> {
    const rows = await prisma.ingredient.findMany({ where: { recipeId, itemId: { not: null } }, select: { itemId: true } });
    const itemIds = [...new Set(rows.map((row) => row.itemId!))];
    if (itemIds.length === 0) return false;
    const items = await prisma.ingredientItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, de: true, en: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true },
    });
    const overview = await unitOverview(items, recipeId);
    const changed = await rewriteRows(
        itemIds,
        (row, language) => {
            const entry = row.itemId === null ? undefined : overview.get(row.itemId);
            const standard = entry?.state.unit ?? null;
            const item = items.find((candidate) => candidate.id === row.itemId);
            if (!entry || standard === null || !item) return null;
            const parts = splitAmount(row.amount);
            if (parts.quantity === null) return null;
            const written = parts.unit ?? '';
            const kind = familyOf(measureOf(written));
            const standardKind = familyOf(measureOf(standard));
            if (!kind || !standardKind || item.moreUnits.includes(kind)) return null;
            if (kind === standardKind) {
                // Only sizes of grams and millilitres; "2 EL" stays "2 EL", a spoon is how one cooks.
                if ((kind !== 'mass' && kind !== 'volume') || measureOf(written) === 'spoon' || measureOf(standard) === 'spoon' || unitKey(written) === standard) return null;
            }
            const quantity = convertQuantity(parts.quantity, written, standard, entry.units);
            const quantityMax = parts.quantityMax === null ? null : convertQuantity(parts.quantityMax, written, standard, entry.units);
            if (quantity === null || (parts.quantityMax !== null && quantityMax === null)) return null;
            const unit = standard === '' ? null : unitLabel(standard, language, (quantityMax ?? quantity) > 1);
            return { amount: formatAmount({ quantity, quantityMax, unit }, 1, language) };
        },
        null,
        recipeId
    );
    return changed > 0;
}
