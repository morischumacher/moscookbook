import prisma from './prisma';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { commonIngredient } from './ingredientNames';
import { isMeasure, unitsOf, type Units } from './shoppingParts';
import { convertQuantity, familyOf, isEuropean, measureOf, mirroredAmount, unitKey, unitLabel, unitState, type UnitState, type UnitUse } from './ingredientUnits';
import { formatAmount, splitAmount } from './ingredientParts';
import { toMetric } from './units';
import { rewriteRows, type RowEditor } from './recipeRowsDb';
import { formatShape, shapeOf } from './ingredientShape';
import { shoppingKey } from './shopping';
import { brokenGermanName, itemKeys } from './ingredientMatch';
import { aiCapability } from './aiConfig';
import { canUseAi, completeWithKey, extractJson } from './aiImport';
import { usageRecorder } from './tokenUsageDb';

/**
 * The ingredients' units as the database has them (lib/ingredientUnits for
 * the rules): which units their recipe rows use, each card's main unit and
 * the families that are a question, the recipes brought into the main units
 * where that is sure, and conversions learned from the AI. Nothing here asks
 * an AI by itself.
 */

/** Every ingredient's recipe rows, counted by unit (its stored form); without one recipe's, when given. */
export async function unitUses(withoutRecipe?: number): Promise<Map<number, UnitUse[]>> {
    const groups = await prisma.ingredient.groupBy({
        by: ['itemId', 'unit'],
        // A row with no amount at all ("Chiliöl, zum Servieren") says nothing about the unit: not counted as pieces.
        where: { itemId: { not: null }, OR: [{ quantity: { not: null } }, { unit: { not: null } }], ...(withoutRecipe !== undefined ? { recipeId: { not: withoutRecipe } } : {}) },
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

export interface UnitOverview {
    state: UnitState;
    uses: UnitUse[];
    units: Units | null;
}

export const itemSelect = { id: true, de: true, en: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true } as const;

export type ItemRow = { id: number; de: string; en: string; buyMeasure: string | null; factors: unknown; unit: string | null; moreUnits: string[]; createdAt: Date };

/** Every ingredient's units: its main one, the families that are a question, and how it converts. */
export async function unitOverview(items?: ItemRow[], withoutRecipe?: number): Promise<Map<number, UnitOverview>> {
    const [all, uses] = await Promise.all([items ?? prisma.ingredientItem.findMany({ select: itemSelect }), unitUses(withoutRecipe)]);
    const overview = new Map<number, UnitOverview>();
    for (const item of all) {
        const mine = uses.get(item.id) ?? [];
        const units = unitsOf(item, commonIngredient(item.de)?.id ?? commonIngredient(item.en)?.id ?? null);
        overview.set(item.id, { state: unitState(item, mine, units), uses: mine, units });
    }
    return overview;
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
 * ingredient. Returns how many it taught.
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
        return taught;
    } finally {
        await usage.flush();
    }
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
    const items = await prisma.ingredientItem.findMany({ where: { id: { in: itemIds } }, select: itemSelect });
    const overview = await unitOverview(items, recipeId);
    return (await rewriteRows(itemIds, metricThenStandard(overview, items), null, recipeId)) > 0;
}


/**
 * The row editor that writes an amount in its ingredient's standard unit
 * where that is sure (see applyStandardUnits): sizes of grams and
 * millilitres, and other kinds with a known conversion. Spoons stay spoons.
 */
function toStandard(overview: Map<number, UnitOverview>, items: ItemRow[]): RowEditor {
    return (row, language) => {
        const entry = row.itemId === null ? undefined : overview.get(row.itemId);
        const standard = entry?.state.unit ?? null;
        const item = items.find((candidate) => candidate.id === row.itemId);
        if (!entry || standard === null || !item) return null;
        // Read off the recipes rather than chosen: only when it is clearly the most used, never a tie.
        if (!entry.state.chosen) {
            const mine = entry.uses.find((use) => use.unit === standard)?.count ?? 0;
            if (entry.uses.some((use) => use.unit !== standard && use.count >= mine)) return null;
        }
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
    };
}

/**
 * First "cups", "oz", "lb" in grams or millilitres — the cookbook's kitchen is
 * European, and no card is needed for that (lib/units toMetric) — then the
 * card's main unit where that is sure (toStandard). Spoons stay spoons.
 */
function metricThenStandard(overview: Map<number, UnitOverview>, items: ItemRow[]): RowEditor {
    const standard = toStandard(overview, items);
    return (row, language, side) => {
        const parts = splitAmount(row.amount);
        let amount = row.amount;
        if (parts.quantity !== null && parts.unit && !isEuropean(unitKey(parts.unit))) {
            const metric = toMetric(parts, row.name, language);
            if (metric.unit !== parts.unit) amount = formatAmount(metric, 1, language);
        }
        const next = standard({ ...row, amount }, language, side);
        return next ?? (amount !== row.amount ? { amount } : null);
    };
}

/**
 * The existing recipes brought into line with their ingredients' standard
 * units, as an import is (toStandard): all of them, or those using `itemIds`
 * — after the admin set an ingredient's standard unit. Every recipe changed
 * keeps its version from before. Returns how many changed.
 */
export async function alignRecipes(itemIds: number[] | null, editedBy: string | null): Promise<number> {
    const items = await prisma.ingredientItem.findMany({ where: itemIds ? { id: { in: itemIds } } : {}, select: itemSelect });
    if (items.length === 0) return 0;
    const overview = await unitOverview(items);
    const decided = items.filter((item) => overview.get(item.id)?.state.unit !== null).map((item) => item.id);
    return rewriteRows(itemIds ? decided : items.map((item) => item.id), metricThenStandard(overview, items), editedBy);
}

/**
 * Every translation's ingredient rows named as the list names them in that
 * language: a recipe with "Frühlingszwiebeln" has "spring onions" in its
 * English version, not whatever the model once wrote. The preparation and
 * notes after the name stay. Every recipe changed keeps its version.
 */
export async function alignTranslationNames(editedBy: string | null): Promise<number> {
    const items = new Map((await prisma.ingredientItem.findMany({ select: { id: true, de: true, en: true } })).map((item) => [item.id, item]));
    // The original's amounts, for the translation's rows beside them: the numbers are the same in both languages.
    const raws = new Map((await prisma.ingredient.findMany({ where: { itemId: { not: null } }, select: { id: true, raw: true } })).map((row) => [row.id, row.raw]));
    return rewriteRows(
        [...items.keys()],
        (row, language, side) => {
            if (side !== 'translation' || row.itemId === null) return null;
            const amount = mirroredAmount(raws.get(row.rowId) ?? '', row.amount, language);
            const name = items.get(row.itemId)?.[language];
            const shape = shapeOf(row.name);
            const renamed = name && shape.base && !shape.base.startsWith('#') && shoppingKey(shape.base) !== shoppingKey(name) ? formatShape({ ...shape, base: name }) : null;
            if (!renamed && amount === row.amount) return null;
            return { ...(renamed ? { name: renamed } : {}), ...(amount !== row.amount ? { amount } : {}) };
        },
        editedBy
    );
}

/**
 * German names that are only a leading adjective ("Fermentierte") emptied:
 * the card shows under "Ohne Übersetzung", to be filled by hand or the AI,
 * and stops looking like every other "Fermentierte …".
 */
async function repairBrokenNames(): Promise<number> {
    const items = await prisma.ingredientItem.findMany({ select: { id: true, de: true, en: true, aliases: true } });
    let fixed = 0;
    for (const item of items.filter(brokenGermanName)) {
        const next = { ...item, de: '' };
        await prisma.ingredientItem.update({ where: { id: item.id }, data: { de: '', keys: itemKeys(next) } });
        fixed += 1;
    }
    return fixed;
}

const ALIGNED = 'ingredients.unitsInLine';
const ALIGNED_VERSION = '6';
let aligned = false;

/** Once after a deploy: every existing recipe in its ingredients' main units, and its translation in the list's names. Cheap after the first time. */
export async function ensureUnitsInLine(): Promise<void> {
    if (aligned) return;
    const row = await prisma.appSetting.findUnique({ where: { key: ALIGNED }, select: { value: true } }).catch(() => null);
    if (row?.value === ALIGNED_VERSION) {
        aligned = true;
        return;
    }
    const running = /^running:(\d+)$/.exec(row?.value ?? '');
    if (running && Date.now() - Number(running[1]) < 10 * 60_000) return;
    const claim = `running:${Date.now()}`;
    const claimed = row
        ? (await prisma.appSetting.updateMany({ where: { key: ALIGNED, value: row.value }, data: { value: claim } })).count === 1
        : await prisma.appSetting
              .create({ data: { key: ALIGNED, value: claim } })
              .then(() => true)
              .catch(() => false);
    if (!claimed) return;
    await repairBrokenNames();
    await alignRecipes(null, null);
    await alignTranslationNames(null);
    await prisma.appSetting.update({ where: { key: ALIGNED }, data: { value: ALIGNED_VERSION } });
    aligned = true;
}
