import prisma from './prisma';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { commonIngredient } from './ingredientNames';
import { coreName, itemKeys, keysFor } from './ingredientMatch';
import { findDoubles, pairKey, type DoubleCandidate } from './ingredientDoubles';
import { formatShape, shapeOf } from './ingredientShape';
import { shoppingKey } from './shopping';
import { capitalized, formatAmount, splitAmount } from './ingredientParts';
import { amountIn, convertQuantity, familyOf, isEuropean, measureOf, rebased, storedFactor, unitLabel } from './ingredientUnits';
import { alignRecipes, itemSelect, unitOverview } from './ingredientUnitsDb';
import { rewriteRows } from './recipeRowsDb';
import { aiCapability } from './aiConfig';
import { canUseAi, completeWithKey, extractJson } from './aiImport';
import { smallModelFor } from './aiProviders';
import { usageRecorder } from './tokenUsageDb';

/**
 * What the admin decides about the ingredient list (admin → Zutaten, "Zu
 * entscheiden"), in exactly two kinds of question:
 *
 * 1. "The same ingredient?" — two cards look alike: merge them, or they are
 *    different (lib/ingredientDoubles finds them, by rules).
 * 2. "A new unit?" — recipes write an ingredient in a unit its card does not
 *    list with a conversion: convert those recipes to the main unit, or take
 *    the unit onto the card, with its conversion (lib/ingredientUnits).
 *
 * Every question can also be left to the AI — one question, or all at once
 * in one call to the small model. What it decided comes back as a list, each
 * entry undoable where that is possible (a merge is not).
 *
 * And the list kept tidy: ingredients no recipe and no shopping list has used
 * for 30 days go, unless they are the starting stock (lib/ingredientNames)
 * or the admin changed them by hand.
 */

const NOT_DOUBLES = 'ingredients.notDoubles';

export async function notDoubles(): Promise<Set<string>> {
    const row = await prisma.appSetting.findUnique({ where: { key: NOT_DOUBLES }, select: { value: true } }).catch(() => null);
    try {
        return new Set(JSON.parse(row?.value ?? '[]') as string[]);
    } catch {
        return new Set();
    }
}

const AI_DOUBLES = 'ingredients.aiDoubles';

/** Pairs the AI's look through the list ("KI nach Doppelungen suchen") proposed: questions like the rules' ones. */
async function aiDoubles(): Promise<[number, number][]> {
    const row = await prisma.appSetting.findUnique({ where: { key: AI_DOUBLES }, select: { value: true } }).catch(() => null);
    try {
        return (JSON.parse(row?.value ?? '[]') as [number, number][]).filter((pair) => Array.isArray(pair) && pair.length === 2);
    } catch {
        return [];
    }
}

/** More proposed pairs kept as questions. */
export async function addAiDoubles(pairs: [number, number][]): Promise<void> {
    const known = await aiDoubles();
    const keys = new Set(known.map(([a, b]) => pairKey(a, b)));
    for (const [a, b] of pairs) if (a !== b && !keys.has(pairKey(a, b))) known.push([a, b]);
    const value = JSON.stringify(known.slice(-500));
    await prisma.appSetting.upsert({ where: { key: AI_DOUBLES }, update: { value }, create: { key: AI_DOUBLES, value } });
}

/** A proposed pair marked as two things (or, `different: false`, as a question again). */
export async function markDifferent(a: number, b: number, different = true): Promise<void> {
    const skip = await notDoubles();
    if (different) skip.add(pairKey(a, b));
    else skip.delete(pairKey(a, b));
    const value = JSON.stringify([...skip].slice(-2000));
    await prisma.appSetting.upsert({ where: { key: NOT_DOUBLES }, update: { value }, create: { key: NOT_DOUBLES, value } });
}

/** Whether an ingredient is part of the starting stock: kept even when no recipe uses it. */
export const isStock = (item: { de: string; en: string }) => commonIngredient(item.de) !== null || commonIngredient(item.en) !== null;

export interface UnitQuestion {
    itemId: number;
    /** The family of unit (lib/ingredientUnits familyOf). */
    family: string;
    /** The unit its rows write most in that family: what the question shows ("Stück", "cups"). */
    unit: string;
    rows: number;
}

/** Every open question: the doubles, and the units. */
export async function openQuestions(): Promise<{ doubles: DoubleCandidate[]; units: UnitQuestion[] }> {
    const items = await prisma.ingredientItem.findMany({ select: { ...itemSelect, aliases: true, enAliases: true } });
    const [overview, skip] = await Promise.all([unitOverview(items), notDoubles()]);
    const units: UnitQuestion[] = [];
    for (const item of items) {
        const entry = overview.get(item.id);
        if (!entry) continue;
        for (const family of entry.state.odd) {
            const mine = entry.uses.filter((use) => familyOf(measureOf(use.unit)) === family).sort((a, b) => b.count - a.count);
            if (mine.length > 0) units.push({ itemId: item.id, family, unit: mine[0].unit, rows: mine.reduce((sum, use) => sum + use.count, 0) });
        }
    }
    // The rules' pairs, and the AI's that are still two cards and not marked different.
    const byRules = findDoubles(items, skip);
    const seen = new Set(byRules.map((pair) => pairKey(pair.a, pair.b)));
    const ids = new Set(items.map((item) => item.id));
    const byAi: DoubleCandidate[] = (await aiDoubles())
        .filter(([a, b]) => ids.has(a) && ids.has(b) && !skip.has(pairKey(a, b)) && !seen.has(pairKey(a, b)))
        .map(([a, b]) => ({ a, b, reason: 'ai' }));
    return { doubles: [...byRules, ...byAi], units };
}

/** Two halves of one card: one has only its German name, the other only its English one. */
export const complementary = (a: { de: string; en: string }, b: { de: string; en: string }) =>
    Boolean((a.de && !a.en && b.en && !b.de) || (a.en && !a.de && b.de && !b.en));

/**
 * A card given its name in the other language — from a recipe's translation,
 * row for row, or from the AI. A translation is the same product, so when
 * another card already has that name: a card with only the other language
 * is the other half of this one, and the two become one card with both
 * names; a complete one is asked about ("a translation?"). Returns what
 * happened.
 */
export async function giveName(itemId: number, language: 'de' | 'en', wanted: string, editedBy: string | null): Promise<'named' | 'merged' | 'asked' | 'kept'> {
    const name = capitalized(wanted.trim().slice(0, 120));
    if (!name) return 'kept';
    const item = await prisma.ingredientItem.findUnique({ where: { id: itemId }, select: { id: true, de: true, en: true, aliases: true, enAliases: true } });
    if (!item || item[language]) return 'kept';
    const other = await prisma.ingredientItem.findFirst({ where: { id: { not: itemId }, keys: { hasSome: keysFor(name) } }, orderBy: { id: 'asc' }, select: { id: true, de: true, en: true } });
    if (other) {
        if (complementary(item, other)) {
            // The one more recipes use stays; it ends with both names.
            const [into, from] = (await prisma.ingredient.count({ where: { itemId } })) >= (await prisma.ingredient.count({ where: { itemId: other.id } })) ? [itemId, other.id] : [other.id, itemId];
            await merge(into, [from], editedBy);
            return 'merged';
        }
        await addAiDoubles([[itemId, other.id]]);
        return 'asked';
    }
    const next = { ...item, [language]: name };
    await prisma.ingredientItem.update({ where: { id: itemId }, data: { [language]: name, keys: itemKeys(next) } });
    return 'named';
}

const PAIRS = 'ingredients.translationPairs';
let paired = false;

/**
 * Once after a deploy: every recipe's translation, row for row, gives its
 * card the other name (giveName) — the cards made from the German and the
 * English version of the same recipe become one.
 */
export async function ensureTranslationPairs(): Promise<void> {
    if (paired) return;
    const row = await prisma.appSetting.findUnique({ where: { key: PAIRS }, select: { value: true } }).catch(() => null);
    if (row?.value === '1') {
        paired = true;
        return;
    }
    const claimed = row
        ? (await prisma.appSetting.updateMany({ where: { key: PAIRS, value: row.value }, data: { value: 'running' } })).count === 1
        : await prisma.appSetting
              .create({ data: { key: PAIRS, value: 'running' } })
              .then(() => true)
              .catch(() => false);
    if (!claimed) return;
    const recipes = await prisma.recipe.findMany({
        where: { translations: { some: {} } },
        select: { ingredients: { orderBy: { position: 'asc' }, select: { itemId: true } }, translations: { select: { locale: true, ingredients: true } } },
    });
    for (const recipe of recipes) {
        for (const translation of recipe.translations) {
            if (translation.locale !== 'de' && translation.locale !== 'en') continue;
            const rows = (Array.isArray(translation.ingredients) ? (translation.ingredients as { item?: unknown }[]) : [])
                .map((entry) => (typeof entry?.item === 'string' ? entry.item : ''))
                .filter((item) => item.trim() && !item.trim().startsWith('#'));
            if (rows.length !== recipe.ingredients.length) continue;
            for (const [index, own] of recipe.ingredients.entries()) {
                if (own.itemId === null) continue;
                // Gone by a merge just now: the row points at the card kept.
                const current = await prisma.ingredient.findFirst({ where: { itemId: own.itemId }, select: { itemId: true } });
                if (!current) continue;
                await giveName(own.itemId, translation.locale, coreName(rows[index]), null).catch(() => 'kept');
            }
        }
    }
    await prisma.appSetting.update({ where: { key: PAIRS }, data: { value: '1' } });
    paired = true;
}

/** How many questions wait: the count beside "Zutaten" in the admin menu. */
export async function ingredientTodo(): Promise<number> {
    const open = await openQuestions();
    return open.doubles.length + open.units.length;
}

/**
 * Several ingredients made one: every recipe row and shopping line moves to
 * the one kept, which takes the others' names as further names; the recipes'
 * rows are renamed to it (not the method); the aisle and units only the
 * others knew come along.
 */
export async function merge(into: number, from: number[], editedBy: string | null): Promise<{ merged: number; recipes: number }> {
    const select = { de: true, en: true, aliases: true, enAliases: true, buyMeasure: true, factors: true, aisle: true, unit: true, moreUnits: true } as const;
    const kept = await prisma.ingredientItem.findUnique({ where: { id: into }, select });
    const gone = await prisma.ingredientItem.findMany({ where: { id: { in: from } }, select });
    if (!kept || gone.length === 0) return { merged: 0, recipes: 0 };
    const de = capitalized(kept.de || gone.find((item) => item.de)?.de || '');
    const en = capitalized(kept.en || gone.find((item) => item.en)?.en || '');

    // Renamed before the rows move, while they can still be told apart.
    const recipes = await rewriteRows(
        from,
        (row, language) => {
            if (row.itemId === null || !from.includes(row.itemId)) return null;
            const name = language === 'de' ? de : en;
            const shape = shapeOf(row.name);
            if (!name || !shape.base || shape.base.startsWith('#') || shoppingKey(shape.base) === shoppingKey(name)) return null;
            return { name: formatShape({ ...shape, base: name }) };
        },
        editedBy
    );

    await prisma.$transaction(async (tx) => {
        // Each language's names stay in that language.
        const further = (names: string[], own: string) => [...new Set(names.filter((alias) => alias && alias !== own))].slice(0, 60);
        const aliases = further([...kept.aliases, ...gone.flatMap((item) => [item.de, ...item.aliases])], de);
        const enAliases = further([...kept.enAliases, ...gone.flatMap((item) => [item.en, ...item.enAliases])], en);
        const withUnits = kept.buyMeasure ? kept : (gone.find((item) => item.buyMeasure) ?? kept);
        const factors = {
            ...Object.assign({}, ...gone.filter((item) => item.buyMeasure === withUnits.buyMeasure).map((item) => item.factors as object)),
            ...(withUnits.factors as object),
        };
        const unit = kept.unit ?? gone.find((item) => item.unit !== null)?.unit ?? null;
        await tx.ingredient.updateMany({ where: { itemId: { in: from } }, data: { itemId: into } });
        await tx.shoppingItem.updateMany({ where: { itemId: { in: from } }, data: { itemId: into } });
        await tx.ingredientItem.deleteMany({ where: { id: { in: from } } });
        await tx.ingredientItem.update({
            where: { id: into },
            data: {
                de,
                en,
                aliases,
                enAliases,
                keys: itemKeys({ de, en, aliases, enAliases }),
                aisle: kept.aisle ?? gone.find((item) => item.aisle)?.aisle ?? null,
                buyMeasure: withUnits.buyMeasure,
                factors,
                unit,
                moreUnits: [...new Set([...kept.moreUnits, ...gone.flatMap((item) => item.moreUnits)])].filter((kind) => unit === null || kind !== familyOf(measureOf(unit))).slice(0, 12),
                handEdited: true,
            },
        });
    });
    return { merged: gone.length, recipes };
}

/** A recipe row's amount set back (or set) by hand — the undo of a conversion. */
export interface RowUndo {
    rowId: number;
    amount: string;
}

/**
 * Every recipe row of an ingredient in one family of unit, rewritten in the
 * main unit — "2 cups" → "200 g" — in the recipe and its translation. Rows
 * with no number or no known way stay, counted as skipped. Returns what to
 * set back to undo it.
 */
export async function convertFamily(id: number, family: string, editedBy: string | null): Promise<{ recipes: number; skipped: number; undo: RowUndo[] }> {
    const item = await prisma.ingredientItem.findUnique({ where: { id }, select: itemSelect });
    if (!item) return { recipes: 0, skipped: 0, undo: [] };
    const overview = (await unitOverview([item])).get(id);
    const main = overview?.state.unit ?? null;
    if (main === null) return { recipes: 0, skipped: 0, undo: [] };
    const before = await prisma.ingredient.findMany({ where: { itemId: id }, select: { id: true, raw: true } });
    let skipped = 0;
    const touched = new Set<number>();
    const recipes = await rewriteRows(
        [id],
        (row, language) => {
            if (row.itemId !== id) return null;
            const parts = splitAmount(row.amount);
            if (familyOf(measureOf(parts.unit)) !== family) return null;
            const quantity = parts.quantity === null ? null : convertQuantity(parts.quantity, parts.unit ?? '', main, overview?.units ?? null);
            const quantityMax = parts.quantityMax === null ? null : convertQuantity(parts.quantityMax, parts.unit ?? '', main, overview?.units ?? null);
            if (quantity === null || (parts.quantityMax !== null && quantityMax === null)) {
                skipped += 1;
                return null;
            }
            touched.add(row.rowId);
            return { amount: formatAmount({ quantity, quantityMax, unit: main === '' ? null : unitLabel(main, language, (quantityMax ?? quantity) > 1) }, 1, language) };
        },
        editedBy
    );
    return { recipes, skipped, undo: before.filter((row) => touched.has(row.id)).map((row) => ({ rowId: row.id, amount: row.raw })) };
}

/** One recipe row's amount replaced by hand ("Loads of" → "1 Bund"), and its translation's beside it. */
export async function setRowAmount(rowId: number, amount: string, editedBy: string | null): Promise<number> {
    const row = await prisma.ingredient.findUnique({ where: { id: rowId }, select: { itemId: true, recipeId: true } });
    if (!row || row.itemId === null) return 0;
    return rewriteRows([row.itemId], (candidate, language) => (candidate.rowId === rowId ? { amount: amountIn(amount, language) } : null), editedBy, undefined, row.recipeId);
}

export type UnitChoice = 'convert' | 'keep';

/**
 * A "new unit?" question answered: the conversion "a `unit` = b main unit"
 * written onto the card, and then either the recipes converted to the main
 * unit, or the unit taken onto the card. The main unit, read off the
 * recipes until now, is kept from here on.
 */
export async function resolveUnit(
    id: number,
    unit: string,
    a: number,
    b: number,
    choice: UnitChoice,
    editedBy: string | null
): Promise<{ recipes: number; skipped: number; undo: { rows: RowUndo[]; family: string | null } }> {
    const item = await prisma.ingredientItem.findUnique({ where: { id }, select: itemSelect });
    const overview = item ? (await unitOverview([item])).get(id) : undefined;
    const main = overview?.state.unit ?? null;
    const family = familyOf(measureOf(unit));
    if (!item || main === null || !family) return { recipes: 0, skipped: 0, undo: { rows: [], family: null } };
    const mainMeasure = measureOf(main)!;
    const known = overview?.units ? rebased(overview.units, mainMeasure).factors : {};
    const stored = storedFactor(unit, a, main, b);
    await prisma.ingredientItem.update({
        where: { id },
        data: {
            unit: main,
            buyMeasure: mainMeasure,
            factors: { ...known, ...(stored && stored.measure !== mainMeasure ? { [stored.measure]: stored.factor } : {}) } as Prisma.InputJsonValue,
            moreUnits: choice === 'keep' ? [...new Set([...item.moreUnits, family])].slice(0, 12) : item.moreUnits,
            handEdited: true,
        },
    });
    if (choice === 'keep') return { recipes: 0, skipped: 0, undo: { rows: [], family } };
    const done = await convertFamily(id, family, editedBy);
    return { recipes: done.recipes, skipped: done.skipped, undo: { rows: done.undo, family: null } };
}

/**
 * Another main unit for a card ("make Stück the main unit"): what converted
 * to the old one converts to the new one, and the old one stays on the card
 * as a further unit, so its recipes stay fine. The recipes follow where sure.
 */
export async function setMainUnit(id: number, main: string | null, editedBy: string | null): Promise<number> {
    const item = await prisma.ingredientItem.findUnique({ where: { id }, select: itemSelect });
    if (!item) return 0;
    if (main === null) {
        await prisma.ingredientItem.update({ where: { id }, data: { unit: null, handEdited: true } });
        return 0;
    }
    const mainMeasure = measureOf(main);
    if (!mainMeasure) return 0;
    const overview = (await unitOverview([item])).get(id);
    const old = overview?.state.unit ?? null;
    const oldFamily = old === null ? null : familyOf(measureOf(old));
    const family = familyOf(mainMeasure);
    const factors = overview?.units ? rebased(overview.units, mainMeasure).factors : {};
    await prisma.ingredientItem.update({
        where: { id },
        data: {
            unit: main,
            buyMeasure: mainMeasure,
            factors: factors as Prisma.InputJsonValue,
            moreUnits: [...new Set([...item.moreUnits, ...(oldFamily ? [oldFamily] : [])])].filter((other) => other !== family).slice(0, 12),
            handEdited: true,
        },
    });
    return alignRecipes([id], editedBy);
}

/** A unit taken off a card again: the undo of "keep". */
export async function removeUnit(id: number, family: string): Promise<void> {
    const item = await prisma.ingredientItem.findUnique({ where: { id }, select: { moreUnits: true } });
    if (item) await prisma.ingredientItem.update({ where: { id }, data: { moreUnits: item.moreUnits.filter((other) => other !== family) } });
}

/**
 * The card's units saved as the admin wrote them: the main unit, and every
 * further unit with "a unit = b main". What converted to the old main unit
 * converts to the new one; the recipes follow where that is sure.
 */
export async function saveUnits(id: number, main: string, rows: { unit: string; a: number; b: number }[], editedBy: string | null): Promise<number> {
    const item = await prisma.ingredientItem.findUnique({ where: { id }, select: itemSelect });
    const mainMeasure = measureOf(main);
    if (!item || !mainMeasure) return 0;
    const overview = (await unitOverview([item])).get(id);
    const factors: Record<string, number> = overview?.units ? { ...rebased(overview.units, mainMeasure).factors } : {};
    const families = new Set<string>();
    for (const row of rows) {
        const stored = storedFactor(row.unit, row.a, main, row.b);
        const family = familyOf(measureOf(row.unit));
        if (!stored || !family || family === familyOf(mainMeasure)) continue;
        factors[stored.measure] = stored.factor;
        families.add(family);
    }
    await prisma.ingredientItem.update({
        where: { id },
        data: { unit: main, buyMeasure: mainMeasure, factors: factors as Prisma.InputJsonValue, moreUnits: [...families].slice(0, 12), handEdited: true },
    });
    return alignRecipes([id], editedBy);
}

/** What the AI did, for the admin to read and, where possible, undo. */
export type AiDecision =
    | { kind: 'merged'; into: string; from: string }
    | { kind: 'different'; a: number; b: number; names: [string, string] }
    | { kind: 'kept'; itemId: number; name: string; unit: string; main: string; a: number; b: number; family: string }
    | { kind: 'converted'; itemId: number; name: string; unit: string; main: string; a: number; b: number; recipes: number; undo: RowUndo[] }
    | { kind: 'open'; name: string };

const decideShape = z.record(z.string(), z.object({ same: z.boolean().optional(), factor: z.number().positive().nullable().optional(), keep: z.boolean().optional() }));

/**
 * Open questions decided by the AI — all of them (up to 40 a call), or one.
 * One call to the small model; what it answered is applied at once.
 */
export async function aiResolve(only: { double: [number, number] } | { unit: { itemId: number; family: string } } | null, editedBy: string | null): Promise<{ decisions: AiDecision[]; left: number } | null> {
    const ai = await aiCapability();
    if (!canUseAi(ai)) return null;
    const open = await openQuestions();
    const doubles = open.doubles.filter((pair) => !only || ('double' in only && pairKey(pair.a, pair.b) === pairKey(only.double[0], only.double[1])));
    const units = open.units.filter((question) => !only || ('unit' in only && question.itemId === only.unit.itemId && question.family === only.unit.family));
    const items = new Map((await prisma.ingredientItem.findMany({ select: { ...itemSelect, aliases: true, enAliases: true } })).map((item) => [item.id, item]));
    const overview = await unitOverview([...items.values()]);
    type Asked = { n: number; double?: DoubleCandidate; unit?: UnitQuestion; main?: string };
    const asked: Asked[] = [];
    const lines: string[] = [];
    for (const pair of doubles) {
        if (asked.length >= 40) break;
        const a = items.get(pair.a);
        const b = items.get(pair.b);
        if (!a || !b) continue;
        asked.push({ n: asked.length + 1, double: pair });
        lines.push(`${asked.length}: same? A: ${a.de || '—'} | ${a.en || '—'} ; B: ${b.de || '—'} | ${b.en || '—'}`);
    }
    for (const question of units) {
        if (asked.length >= 40) break;
        const item = items.get(question.itemId);
        const main = overview.get(question.itemId)?.state.unit ?? null;
        if (!item || main === null) continue;
        const examples = await prisma.ingredient.findMany({ where: { itemId: item.id }, select: { raw: true, unit: true }, take: 30 });
        const written = examples.filter((row) => familyOf(measureOf(row.unit)) === question.family).map((row) => row.raw).slice(0, 4);
        asked.push({ n: asked.length + 1, unit: question, main });
        lines.push(`${asked.length}: unit? ${item.de || item.en} | main unit: ${unitLabel(main, 'de')} | other unit: ${unitLabel(question.unit, 'de')} | recipes write: ${written.join('; ') || '—'}`);
    }
    const left = doubles.length + units.length - asked.length;
    if (asked.length === 0) return { decisions: [], left: 0 };

    const key = ai.keys[0];
    const small = { ...key, model: key.small ?? smallModelFor(key) ?? key.model };
    const usage = usageRecorder('ingredients');
    let answer: z.infer<typeof decideShape> = {};
    try {
        const parsed = decideShape.safeParse(extractJson(await completeWithKey(small, { kind: 'raw', system: DECIDE_PROMPT, text: lines.join('\n') }, usage.report).catch(() => '')));
        if (parsed.success) answer = parsed.data;
    } finally {
        await usage.flush();
    }

    const nameOf = (id: number) => {
        const item = items.get(id);
        return item ? item.de || item.en : '';
    };
    const decisions: AiDecision[] = [];
    const mergedAway = new Set<number>();
    for (const entry of asked) {
        const said = answer[String(entry.n)];
        if (entry.double) {
            const { a, b } = entry.double;
            if (mergedAway.has(a) || mergedAway.has(b) || !said || said.same === undefined) {
                decisions.push({ kind: 'open', name: `${nameOf(a)} ↔ ${nameOf(b)}` });
                continue;
            }
            if (said.same) {
                // The one more recipes use is kept.
                const [into, from] = (await prisma.ingredient.count({ where: { itemId: a } })) >= (await prisma.ingredient.count({ where: { itemId: b } })) ? [a, b] : [b, a];
                const names = { into: nameOf(into), from: nameOf(from) };
                await merge(into, [from], editedBy);
                mergedAway.add(from);
                decisions.push({ kind: 'merged', ...names });
            } else {
                await markDifferent(a, b);
                decisions.push({ kind: 'different', a, b, names: [nameOf(a), nameOf(b)] });
            }
            continue;
        }
        const question = entry.unit!;
        const main = entry.main!;
        if (mergedAway.has(question.itemId) || !said || !said.factor) {
            decisions.push({ kind: 'open', name: nameOf(question.itemId) });
            continue;
        }
        // "1 cup = 100 g": one of the other unit is `factor` of the main one.
        const [a, b] = said.factor >= 1 ? [1, Math.round(said.factor * 100) / 100] : [Math.round((1 / said.factor) * 100) / 100, 1];
        const keep = Boolean(said.keep) && isEuropean(question.unit);
        const done = await resolveUnit(question.itemId, question.unit, a, b, keep ? 'keep' : 'convert', editedBy);
        const base = { itemId: question.itemId, name: nameOf(question.itemId), unit: question.unit, main, a, b };
        decisions.push(keep ? { kind: 'kept', ...base, family: question.family } : { kind: 'converted', ...base, recipes: done.recipes, undo: done.undo.rows });
    }
    return { decisions, left };
}

const DECIDE_PROMPT = `You decide open questions about the ingredient list of a German/English personal cookbook.
The kitchen is European: g, kg, ml, l, EL (tablespoon), TL (teaspoon), Prise, Zehe, Bund, Stück, Dose.

You receive numbered lines of two kinds:
- "n: same? A: <German> | <English> ; B: <German> | <English>" — are A and B the same thing to buy?
  Not the same: red and white onions, butter and margarine, chicken breast and chicken thighs,
  coconut milk and milk, sugar and icing sugar. When unsure, say false.
- "n: unit? <ingredient> | main unit: <unit> | other unit: <unit> | recipes write: <amounts>" —
  "factor": how much of the main unit ONE of the other unit is, for this ingredient (typical sizes, rough is fine);
  "keep": true when the other unit is a normal way to write this ingredient in a European kitchen
  (a Bund of herbs, a Zehe of garlic, an EL of a paste), false when the recipes should rather say the main unit.
  cups, oz, lb and fl oz are never kept. When the amounts are vague ("loads of", "etwas"), "factor": null.

Return JSON only, one entry per line number:
{"1": {"same": true}, "2": {"factor": 100, "keep": false}}
No explanation, no code fences.`;

const rowShape = z.object({ choice: z.number().int().nullable().optional(), factor: z.number().positive().nullable().optional(), keep: z.boolean().optional() });

/**
 * One amber row of the recipe form left to the AI: which of the similar
 * ingredients it is (or none: a new one), or for another unit how much of
 * the main unit one of it is and whether the card keeps it. Nothing is
 * written here — the form applies the answer, as a tap would.
 */
export async function aiRow(
    question: { kind: 'alike'; name: string; options: { id: number; name: string }[] } | { kind: 'unit'; name: string; main: string; unit: string; amount: string }
): Promise<z.infer<typeof rowShape> | null> {
    const ai = await aiCapability();
    if (!canUseAi(ai)) return null;
    const text =
        question.kind === 'alike'
            ? `1: which? "${question.name}" | options: ${question.options.map((option) => `${option.id} = ${option.name}`).join('; ')}`
            : `1: unit? ${question.name} | main unit: ${unitLabel(question.main, 'de')} | other unit: ${unitLabel(question.unit, 'de')} | recipes write: ${question.amount}`;
    const key = ai.keys[0];
    const small = { ...key, model: key.small ?? smallModelFor(key) ?? key.model };
    const usage = usageRecorder('ingredients');
    try {
        const answer = extractJson(await completeWithKey(small, { kind: 'raw', system: ROW_PROMPT, text }, usage.report).catch(() => '')) as Record<string, unknown> | null;
        const parsed = rowShape.safeParse(answer?.['1']);
        return parsed.success ? parsed.data : {};
    } finally {
        await usage.flush();
    }
}

const ROW_PROMPT = `${DECIDE_PROMPT.split('Return JSON only')[0].trim()}
- "n: which? "<name>" | options: <id> = <name>; …" — "choice": the id of the option that is the same thing to buy as the name, or null when none is.

Return JSON only: {"1": {"choice": 12}} or {"1": {"factor": 100, "keep": false}}. No explanation, no code fences.`;

const NAMES_PROMPT = `You complete the ingredient list of a German/English personal cookbook.

You receive lines "id: German name | English name" with one name missing ("—").

Return JSON only: {"<id>": {"de": "…", "en": "…"}, …} — both names for every line, the missing one
as a cook in that language writes it on a shopping list (plural where one buys several: "Zwiebeln",
"onions"). Keep the given name as it is. No explanation, no code fences.`;

/**
 * The cards of a recipe that lack a name in one language, given it by the
 * AI (the small model, one call) right after the recipe is saved — a name
 * another card already has makes the two one (giveName). Nothing without an
 * AI. Returns how many cards it named.
 */
export async function fillMissingNames(recipeId: number): Promise<number> {
    const ai = await aiCapability();
    if (!canUseAi(ai)) return 0;
    const rows = await prisma.ingredient.findMany({ where: { recipeId, itemId: { not: null } }, select: { itemId: true } });
    const ids = [...new Set(rows.map((row) => row.itemId!))];
    const missing = (await prisma.ingredientItem.findMany({ where: { id: { in: ids } }, select: { id: true, de: true, en: true } })).filter((item) => !item.de !== !item.en);
    if (missing.length === 0) return 0;
    const key = ai.keys[0];
    const small = { ...key, model: key.small ?? smallModelFor(key) ?? key.model };
    const usage = usageRecorder('ingredients');
    let named = 0;
    try {
        const answer = extractJson(
            await completeWithKey(small, { kind: 'raw', system: NAMES_PROMPT, text: missing.map((item) => `${item.id}: ${item.de || '—'} | ${item.en || '—'}`).join('\n') }, usage.report).catch(() => '')
        ) as Record<string, { de?: unknown; en?: unknown }> | null;
        for (const item of missing) {
            const given = answer?.[String(item.id)];
            const language = item.de ? 'en' : 'de';
            const name = given && typeof given[language] === 'string' ? (given[language] as string) : '';
            if (name && (await giveName(item.id, language, name, null)) !== 'kept') named += 1;
        }
    } finally {
        await usage.flush();
    }
    return named;
}

const TIDY = 'ingredients.tidy';
const UNUSED_FOR = 30 * 24 * 3600_000;

/**
 * Once a day: every ingredient a recipe or shopping list uses marked as used
 * today, and every one unused for 30 days deleted — unless it is the
 * starting stock or the admin changed it by hand. Cheap after the first time
 * a day.
 */
export async function ensureCatalogTidy(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const row = await prisma.appSetting.findUnique({ where: { key: TIDY }, select: { value: true } }).catch(() => null);
    if (row?.value === today) return 0;
    const claimed = row
        ? (await prisma.appSetting.updateMany({ where: { key: TIDY, value: row.value }, data: { value: today } })).count === 1
        : await prisma.appSetting
              .create({ data: { key: TIDY, value: today } })
              .then(() => true)
              .catch(() => false);
    if (!claimed) return 0;
    const items = await prisma.ingredientItem.findMany({
        select: { id: true, de: true, en: true, handEdited: true, lastUsedAt: true, createdAt: true, _count: { select: { ingredients: true, shopping: true } } },
    });
    const used = items.filter((item) => item._count.ingredients + item._count.shopping > 0).map((item) => item.id);
    if (used.length) await prisma.ingredientItem.updateMany({ where: { id: { in: used } }, data: { lastUsedAt: new Date() } });
    const stale = items
        .filter((item) => item._count.ingredients + item._count.shopping === 0 && !item.handEdited && !isStock(item))
        .filter((item) => Date.now() - (item.lastUsedAt ?? item.createdAt).getTime() > UNUSED_FOR)
        .map((item) => item.id);
    if (stale.length) await prisma.ingredientItem.deleteMany({ where: { id: { in: stale } } });
    return stale.length;
}

/** "Delete all" under "Nicht genutzt": every unused ingredient that is not the starting stock. */
export async function deleteUnused(): Promise<number> {
    const items = await prisma.ingredientItem.findMany({ select: { id: true, de: true, en: true, _count: { select: { ingredients: true, shopping: true } } } });
    const gone = items.filter((item) => item._count.ingredients + item._count.shopping === 0 && !isStock(item)).map((item) => item.id);
    if (gone.length) await prisma.ingredientItem.deleteMany({ where: { id: { in: gone } } });
    return gone.length;
}
