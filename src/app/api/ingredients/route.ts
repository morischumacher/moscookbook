import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { itemKeys, linkAllUnlinked } from '@/lib/ingredientCatalog';
import { findDoubles, pairKey } from '@/lib/ingredientDoubles';
import { aiCapability } from '@/lib/aiConfig';
import { canUseAi, completeWithKey, extractJson } from '@/lib/aiImport';
import { usageRecorder } from '@/lib/tokenUsageDb';
import { commonIngredient, germanName } from '@/lib/ingredientNames';
import { isMeasure, unitsOf } from '@/lib/shoppingParts';
import { aisleOf, CHOOSABLE_AISLES, isAisle, shoppingKey } from '@/lib/shopping';
import { formatShape, shapeOf } from '@/lib/ingredientShape';
import { rewriteRows } from '@/lib/recipeRowsDb';
import { DUE_COUNT, learnPending, unitOverview } from '@/lib/ingredientUnitsDb';
import { convertQuantity, familyOf, measureOf, unitKey, unitLabel } from '@/lib/ingredientUnits';
import { splitAmount, formatAmount } from '@/lib/ingredientParts';

/**
 * The ingredient catalogue for admin → Zutaten (lib/ingredientCatalog).
 *
 * GET: every ingredient with how many recipe rows use it, the probable
 *   doubles found by rules (lib/ingredientDoubles), and whether an AI can help.
 * PATCH {id, de, en, aliases}: names corrected; what it is found by follows.
 * DELETE ?id=: an ingredient no recipe uses any more.
 * POST {action}:
 *   merge {into, from}: several into one — rows, shopping lines and names move
 *     over, and the recipes' rows are renamed to the one kept (not the method);
 *   setUnit {id, unit}: its standard unit ('g', 'bunch', '' for pieces; null: read off the recipes);
 *   allowUnit {id, measure}: a further kind of unit it may be written in;
 *   convertRows {id, measure}: the recipes' rows in that kind rewritten in the standard unit;
 *   aiUnits: the gathered conversions the shopping list lacks, asked of the AI;
 *   notDouble {a, b}: a proposed pair is two things, and is not proposed again;
 *   linkAll: every recipe row not yet pointed at an ingredient, pointed;
 *   aiCheck: an AI's proposals — doubles and missing names — to confirm one by one;
 *   aiTranslate: the missing other-language names filled by an AI, at once.
 */

const NOT_DOUBLES = 'ingredients.notDoubles';

async function notDoubles(): Promise<Set<string>> {
    const row = await prisma.appSetting.findUnique({ where: { key: NOT_DOUBLES }, select: { value: true } }).catch(() => null);
    try {
        return new Set(JSON.parse(row?.value ?? '[]') as string[]);
    } catch {
        return new Set();
    }
}

async function catalogue() {
    const items = await prisma.ingredientItem.findMany({
        orderBy: [{ de: 'asc' }, { en: 'asc' }],
        select: {
            id: true,
            de: true,
            en: true,
            aliases: true,
            buyMeasure: true,
            factors: true,
            aisle: true,
            unit: true,
            moreUnits: true,
            createdAt: true,
            _count: { select: { ingredients: true } },
        },
    });
    const overview = await unitOverview(items);
    return items.map((item) => ({
        id: item.id,
        de: item.de,
        en: item.en,
        aliases: item.aliases,
        uses: item._count.ingredients,
        // What the shopping list converts with (lib/shoppingParts): its own, or the defaults for a common one.
        units: unitsOf(item, commonIngredient(item.de)?.id ?? commonIngredient(item.en)?.id ?? null),
        ownUnits: item.buyMeasure !== null,
        createdAt: item.createdAt.toISOString(),
        // Set by hand, or null; and where the rules would put it, to show beside "automatic".
        aisle: isAisle(item.aisle) ? item.aisle : null,
        ruleAisle: aisleOf(item.de || item.en),
        // Its standard unit, the units its rows use, the kinds in conflict and those still to convert (lib/ingredientUnits).
        unit: overview.get(item.id)?.state.unit ?? null,
        unitChosen: overview.get(item.id)?.state.chosen ?? false,
        moreUnits: item.moreUnits,
        unitUses: (overview.get(item.id)?.uses ?? []).sort((a, b) => b.count - a.count),
        oddUnits: overview.get(item.id)?.state.odd ?? [],
        missingConversions: overview.get(item.id)?.missing ?? [],
    }));
}

export const GET = route({ access: 'admin', label: 'The ingredient catalogue' }, async () => {
    const [items, skip, ai, unlinked] = await Promise.all([
        catalogue(),
        notDoubles(),
        aiCapability(),
        prisma.ingredient.count({ where: { itemId: null } }),
    ]);
    return NextResponse.json({ items, doubles: findDoubles(items, skip), aiAvailable: canUseAi(ai), unlinked, dueCount: DUE_COUNT });
});

const name = z.string().trim().max(120);
const patchBody = z.object({
    id: z.number().int().positive(),
    de: name,
    en: name,
    aliases: z.array(name).max(30).transform((list) => [...new Set(list.filter(Boolean))]),
    // The units it is bought in; null puts it back to the defaults. Left out: unchanged.
    units: z
        .object({
            buy: z.string().max(40).refine(isMeasure),
            factors: z.record(z.string().max(40).refine(isMeasure), z.number().positive().max(100_000)),
        })
        .nullable()
        .optional(),
    // The shop aisle by hand; null puts it back to the rules. Left out: unchanged.
    aisle: z.string().refine((value) => (CHOOSABLE_AISLES as string[]).includes(value)).nullable().optional(),
});

export const PATCH = route({ access: 'admin', body: patchBody, label: 'Correcting an ingredient' }, async ({ body }) => {
    if (!body.de && !body.en) refuse(400, 'An ingredient needs a name.');
    const updated = await prisma.ingredientItem.updateMany({
        where: { id: body.id },
        data: {
            de: germanName(body.de),
            en: body.en,
            aliases: body.aliases,
            keys: itemKeys(body),
            ...(body.units === undefined ? {} : body.units === null ? { buyMeasure: null, factors: {} } : { buyMeasure: body.units.buy, factors: body.units.factors }),
            ...(body.aisle === undefined ? {} : { aisle: body.aisle }),
        },
    });
    if (updated.count !== 1) refuse(404, 'That ingredient is gone.');
    return NextResponse.json({ ok: true });
});

export const DELETE = route({ access: 'admin', label: 'Deleting an ingredient' }, async ({ req }) => {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) refuse(400, 'Delete which ingredient?');
    const used = await prisma.ingredient.count({ where: { itemId: id } });
    if (used > 0) refuse(409, 'Recipes still use this ingredient. Merge it into another instead.');
    await prisma.ingredientItem.deleteMany({ where: { id } });
    return NextResponse.json({ ok: true });
});

const postBody = z.discriminatedUnion('action', [
    z.object({ action: z.literal('merge'), into: z.number().int().positive(), from: z.array(z.number().int().positive()).min(1).max(50) }),
    z.object({ action: z.literal('notDouble'), a: z.number().int().positive(), b: z.number().int().positive() }),
    z.object({ action: z.literal('linkAll') }),
    z.object({ action: z.literal('aiCheck') }),
    z.object({ action: z.literal('aiTranslate') }),
    z.object({ action: z.literal('setUnit'), id: z.number().int().positive(), unit: z.string().trim().max(40).nullable() }),
    z.object({ action: z.literal('allowUnit'), id: z.number().int().positive(), measure: z.string().max(40).refine(isMeasure) }),
    z.object({ action: z.literal('convertRows'), id: z.number().int().positive(), measure: z.string().max(40).refine(isMeasure) }),
    z.object({ action: z.literal('aiUnits') }),
]);

export const POST = route({ access: 'admin', body: postBody, label: 'Tidying the ingredient catalogue' }, async ({ body, user }) => {
    if (body.action === 'merge') return NextResponse.json(await merge(body.into, body.from.filter((id) => id !== body.into), user.name));

    if (body.action === 'setUnit') {
        const unit = body.unit === null ? null : unitKey(body.unit);
        if (unit !== null && measureOf(unit) === null) refuse(400, 'That unit is not known.');
        // A kind made the standard is no longer a further one.
        const item = await prisma.ingredientItem.findUnique({ where: { id: body.id }, select: { moreUnits: true } });
        if (!item) refuse(404, 'That ingredient is gone.');
        const kind = unit === null ? null : familyOf(measureOf(unit));
        await prisma.ingredientItem.update({ where: { id: body.id }, data: { unit, moreUnits: item.moreUnits.filter((other) => other !== kind) } });
        return NextResponse.json({ ok: true });
    }

    if (body.action === 'allowUnit') {
        const item = await prisma.ingredientItem.findUnique({ where: { id: body.id }, select: { moreUnits: true } });
        if (!item) refuse(404, 'That ingredient is gone.');
        await prisma.ingredientItem.update({ where: { id: body.id }, data: { moreUnits: [...new Set([...item.moreUnits, body.measure])].slice(0, 12) } });
        return NextResponse.json({ ok: true });
    }

    if (body.action === 'convertRows') return NextResponse.json(await convertRows(body.id, body.measure, user.name));

    if (body.action === 'aiUnits') {
        const ai = await aiCapability();
        if (!canUseAi(ai)) refuse(501, 'The AI is switched off or has no key.');
        return NextResponse.json(await learnPending());
    }

    if (body.action === 'notDouble') {
        const skip = await notDoubles();
        skip.add(pairKey(body.a, body.b));
        const value = JSON.stringify([...skip].slice(-2000));
        await prisma.appSetting.upsert({ where: { key: NOT_DOUBLES }, update: { value }, create: { key: NOT_DOUBLES, value } });
        return NextResponse.json({ ok: true });
    }

    if (body.action === 'linkAll') return NextResponse.json(await linkAllUnlinked(2000));

    const ai = await aiCapability();
    if (!canUseAi(ai)) refuse(501, 'The AI is switched off or has no key.');
    const items = await catalogue();
    const usage = usageRecorder('ingredients');
    const ask = async (system: string, text: string): Promise<unknown> => {
        for (const key of ai.keys) {
            try {
                return extractJson(await completeWithKey(key, { kind: 'raw', system, text }, usage.report));
            } catch {
                // The next key, if there is one.
            }
        }
        return null;
    };
    const known = new Set(items.map((item) => item.id));
    const list = items.map((item) => `${item.id}: ${item.de || '—'} | ${item.en || '—'}`).join('\n');

    try {
        if (body.action === 'aiCheck') {
            const answer = z
                .object({
                    doubles: z.array(z.array(z.number())).default([]),
                    translations: z.array(z.object({ id: z.number(), de: z.string().optional(), en: z.string().optional() })).default([]),
                })
                .safeParse(await ask(CHECK_PROMPT, list));
            if (!answer.success) refuse(502, 'The AI did not answer usefully. Nothing was changed.');
            return NextResponse.json({
                // Only what it was shown, two or more of them: nothing is applied here.
                doubles: answer.data.doubles.map((group) => [...new Set(group.filter((id) => known.has(id)))]).filter((group) => group.length > 1),
                translations: answer.data.translations
                    .filter((row) => known.has(row.id))
                    .map((row) => ({ id: row.id, de: germanName((row.de ?? '').slice(0, 120)), en: (row.en ?? '').trim().slice(0, 120) })),
            });
        }

        // aiTranslate: only the empty side of each, written at once.
        const missing = items.filter((item) => !item.de || !item.en).slice(0, 150);
        if (missing.length === 0) return NextResponse.json({ filled: 0 });
        const answer = z
            .object({ translations: z.array(z.object({ id: z.number(), de: z.string().optional(), en: z.string().optional() })).default([]) })
            .safeParse(await ask(TRANSLATE_PROMPT, missing.map((item) => `${item.id}: ${item.de || '—'} | ${item.en || '—'}`).join('\n')));
        if (!answer.success) refuse(502, 'The AI did not answer usefully. Nothing was changed.');
        let filled = 0;
        for (const row of answer.data.translations) {
            const item = missing.find((candidate) => candidate.id === row.id);
            if (!item) continue;
            const next = { ...item, de: item.de || germanName((row.de ?? '').slice(0, 120)), en: item.en || (row.en ?? '').trim().slice(0, 120) };
            if (next.de === item.de && next.en === item.en) continue;
            await prisma.ingredientItem.update({ where: { id: item.id }, data: { de: next.de, en: next.en, keys: itemKeys(next) } });
            filled += 1;
        }
        return NextResponse.json({ filled });
    } finally {
        await usage.flush();
    }
});

/**
 * Several ingredients made one: every recipe row and shopping line moves to
 * the one kept, which takes the others' names as further names (so a recipe
 * written with them later still finds it), and an empty language from them.
 */
async function merge(into: number, from: number[], editedBy: string) {
    if (from.length === 0) refuse(400, 'Merge which ingredients?');
    const itemSelect = { de: true, en: true, aliases: true, buyMeasure: true, factors: true, aisle: true, unit: true, moreUnits: true } as const;
    const kept = await prisma.ingredientItem.findUnique({ where: { id: into }, select: itemSelect });
    const gone = await prisma.ingredientItem.findMany({ where: { id: { in: from } }, select: itemSelect });
    if (!kept || gone.length === 0) refuse(404, 'That ingredient is gone.');
    const de = germanName(kept.de || gone.find((item) => item.de)?.de || '');
    const en = kept.en || gone.find((item) => item.en)?.en || '';

    // The recipes' rows renamed to the one kept, in each text's language, with
    // their form, notes and "(optional)" as they were: "Nudeln, gekocht" →
    // "Pasta, gekocht". The method is left alone. Done before the rows move,
    // while they can still be told apart.
    const renamed = await rewriteRows(
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

    return prisma.$transaction(async (tx) => {
        const aliases = [...new Set([...kept.aliases, ...gone.flatMap((item) => [item.de, item.en, ...item.aliases])].filter((alias) => alias && alias !== de && alias !== en))].slice(0, 60);
        // What only the others knew comes along: the aisle, the units they are bought and written in.
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
                keys: itemKeys({ de, en, aliases }),
                aisle: kept.aisle ?? gone.find((item) => item.aisle)?.aisle ?? null,
                buyMeasure: withUnits.buyMeasure,
                factors,
                unit,
                moreUnits: [...new Set([...kept.moreUnits, ...gone.flatMap((item) => item.moreUnits)])].filter((kind) => unit === null || kind !== familyOf(measureOf(unit))).slice(0, 12),
            },
        });
        return { merged: gone.length, recipes: renamed };
    });
}

/**
 * Every recipe row of an ingredient written in one kind of unit, rewritten
 * in its standard unit — "2 EL" → "30 ml", "14 Stück" → "2 Bund" — in the
 * recipe and its translation. Rows whose amount cannot be converted (no
 * number, no known way) stay as they are and are counted.
 */
async function convertRows(id: number, measure: string, editedBy: string) {
    const item = await prisma.ingredientItem.findUnique({ where: { id }, select: { de: true, en: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true } });
    if (!item) refuse(404, 'That ingredient is gone.');
    const overview = (await unitOverview([{ id, ...item }])).get(id);
    const standard = overview?.state.unit ?? null;
    if (standard === null) refuse(409, 'Choose its standard unit first.');
    let skipped = 0;
    const changed = await rewriteRows(
        [id],
        (row, language) => {
            if (row.itemId !== id) return null;
            const parts = splitAmount(row.amount);
            if (familyOf(measureOf(parts.unit)) !== measure) return null;
            if (parts.quantity === null) {
                skipped += 1;
                return null;
            }
            const quantity = convertQuantity(parts.quantity, parts.unit ?? '', standard, overview?.units ?? null);
            const quantityMax = parts.quantityMax === null ? null : convertQuantity(parts.quantityMax, parts.unit ?? '', standard, overview?.units ?? null);
            if (quantity === null) {
                skipped += 1;
                return null;
            }
            const many = (quantityMax ?? quantity) > 1;
            const unit = standard === '' ? null : unitLabel(standard, language, many);
            // "½ Bund", "1,5 EL" written as the recipe writes amounts.
            return { amount: formatAmount({ quantity, quantityMax, unit }, 1, language) };
        },
        editedBy
    );
    return { recipes: changed, skipped };
}

const CHECK_PROMPT = `You tidy the ingredient list of a German/English personal cookbook.

You receive lines "id: German name | English name" ("—" where a name is missing).

Return JSON only: {"doubles": [[id, id, …], …], "translations": [{"id": n, "de": "…", "en": "…"}, …]}

- "doubles": groups of ids that are the same thing to buy, in either language or
  spelling ("Frühlingszwiebeln" and "green onions"; "Ingwer" and "frischer Ingwer").
  Not things that differ when shopping: red and white onions, butter and margarine,
  chicken breast and chicken thighs. When unsure, leave it out.
- "translations": for each line with a missing name, the name in the missing
  language as a cook in that language writes it on a shopping list (plural where
  one buys several: "Zwiebeln", "onions").
- No explanation, no code fences.`;

const TRANSLATE_PROMPT = `You complete the ingredient list of a German/English personal cookbook.

You receive lines "id: German name | English name" with one name missing ("—").

Return JSON only: {"translations": [{"id": n, "de": "…", "en": "…"}, …]} with both
names for every line, the missing one as a cook in that language writes it on a
shopping list (plural where one buys several: "Zwiebeln", "onions"). Keep the
given name as it is. No explanation, no code fences.`;
