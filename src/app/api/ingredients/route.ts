import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { itemKeys, linkAllUnlinked } from '@/lib/ingredientCatalog';
import { aiCapability } from '@/lib/aiConfig';
import { canUseAi, completeWithKey, extractJson } from '@/lib/aiImport';
import { usageRecorder } from '@/lib/tokenUsageDb';
import { germanName } from '@/lib/ingredientNames';
import { aisleOf, CHOOSABLE_AISLES, isAisle, shoppingKey } from '@/lib/shopping';
import { formatShape, shapeOf } from '@/lib/ingredientShape';
import { rewriteRows } from '@/lib/recipeRowsDb';
import { itemSelect, unitOverview } from '@/lib/ingredientUnitsDb';
import {
    addAiDoubles,
    giveName,
    aiResolve,
    aiRow,
    deleteUnused,
    isStock,
    markDifferent,
    merge,
    openQuestions,
    removeUnit,
    resolveUnit,
    saveUnits,
    setMainUnit,
    setRowAmount,
} from '@/lib/ingredientDecideDb';
import { conversionText, familyOf, isEuropean, measureOf, perUnit, unitForFamily, unitKey } from '@/lib/ingredientUnits';

/**
 * The ingredient list for admin → Zutaten (lib/ingredientCatalog): one card
 * per ingredient — a German and an English name, each with further names,
 * and its units (a main one, and further ones with their conversion) — and
 * the questions to decide (lib/ingredientDecideDb).
 *
 * GET: every card with how many recipe rows use it, the open questions, and whether an AI can help.
 * PATCH {id, de, en, aliases, aisle?}: names (and aisle) corrected; what it is found by follows.
 * DELETE ?id=: an ingredient no recipe uses any more.
 * POST {action}:
 *   merge {into, from} / notDouble {a, b} / sameAgain {a, b}: "the same ingredient?" answered (or asked again);
 *   resolveUnit {id, unit, a, b, choice}: "a new unit?" answered — convert the recipes, or keep the unit;
 *   removeUnit {id, family}: a unit taken off a card (the undo of keeping it);
 *   saveUnits {id, main, rows}: the card's units as written; setMain {id, unit}: another main unit;
 *   setRowAmount {rowId, amount}: one recipe row's amount by hand (also in its translation);
 *   renameItem {id, name, locale}: renamed (the old name a further one), the recipes' rows too;
 *   aiResolve {double?, unit?}: questions decided by the AI — all, or one;
 *   aiRow {question}: one amber row of the recipe form, answered by the AI (applied by the form);
 *   aiCheck: the AI looks for doubles the rules miss (they become questions) and fills missing names;
 *   aiTranslate: the missing other-language names filled by an AI, at once;
 *   create {de, en}: a new card by hand;
 *   giveName {id, language, name}: a card's missing name in one language ("the German version of …");
 *   linkAll: every recipe row not yet pointed at an ingredient, pointed;
 *   deleteUnused: every unused ingredient that is not the starting stock.
 */

async function catalogue() {
    const items = await prisma.ingredientItem.findMany({
        orderBy: [{ de: 'asc' }, { en: 'asc' }],
        select: { ...itemSelect, aliases: true, aisle: true, _count: { select: { ingredients: true, shopping: true } } },
    });
    const overview = await unitOverview(items);
    return items.map((item) => {
        const entry = overview.get(item.id);
        const main = entry?.state.unit ?? null;
        // The card's further units, each with its conversion to the main one ("7 Stück = 1 Bund").
        const further = main === null ? [] : item.moreUnits.filter((family) => family !== familyOf(measureOf(main)));
        return {
            id: item.id,
            de: item.de,
            en: item.en,
            aliases: item.aliases,
            uses: item._count.ingredients,
            onLists: item._count.shopping,
            stock: isStock(item),
            createdAt: item.createdAt.toISOString(),
            aisle: isAisle(item.aisle) ? item.aisle : null,
            ruleAisle: aisleOf(item.de || item.en),
            main,
            mainChosen: entry?.state.chosen ?? false,
            units: further.map((family) => {
                const used = entry?.uses.filter((use) => familyOf(measureOf(use.unit)) === family).sort((a, b) => b.count - a.count)[0];
                const unit = used?.unit ?? unitForFamily(family);
                const factor = main === null ? null : perUnit(unit, main, entry?.units ?? null);
                return { family, unit, ...(factor ? conversionText(unit, main!, factor, 'de') : { a: null, b: null, text: null }) };
            }),
            unitUses: (entry?.uses ?? []).sort((a, b) => b.count - a.count),
        };
    });
}

/** The open questions, with what each card needs to show them: the rows of a unit question, a proposal for its conversion. */
async function questions(items: Awaited<ReturnType<typeof catalogue>>) {
    const open = await openQuestions();
    const byId = new Map(items.map((item) => [item.id, item]));
    const unitItems = [...new Set(open.units.map((question) => question.itemId))];
    const rows = unitItems.length
        ? await prisma.ingredient.findMany({
              where: { itemId: { in: unitItems } },
              orderBy: [{ recipeId: 'asc' }, { position: 'asc' }],
              select: { id: true, raw: true, name: true, unit: true, itemId: true, recipe: { select: { title: true, slug: true } } },
          })
        : [];
    const overview = await unitOverview(
        await prisma.ingredientItem.findMany({ where: { id: { in: unitItems } }, select: itemSelect })
    );
    return {
        doubles: open.doubles.filter((pair) => byId.has(pair.a) && byId.has(pair.b)),
        units: open.units.map((question) => {
            const main = byId.get(question.itemId)?.main ?? '';
            const factor = perUnit(question.unit, main, overview.get(question.itemId)?.units ?? null);
            return {
                ...question,
                main,
                // Kept on the card only if a European kitchen writes it so; "cups" are always converted.
                keepable: isEuropean(question.unit),
                proposal: factor ? conversionText(question.unit, main, factor, 'de') : null,
                rows: rows
                    .filter((row) => row.itemId === question.itemId && familyOf(measureOf(row.unit)) === question.family)
                    .map((row) => ({ rowId: row.id, amount: row.raw, name: row.name, title: row.recipe.title, slug: row.recipe.slug })),
            };
        }),
    };
}

export const GET = route({ access: 'admin', label: 'The ingredient catalogue' }, async () => {
    const [items, ai, unlinked] = await Promise.all([catalogue(), aiCapability(), prisma.ingredient.count({ where: { itemId: null } })]);
    return NextResponse.json({ items, questions: await questions(items), aiAvailable: canUseAi(ai), unlinked });
});

const name = z.string().trim().max(120);
const patchBody = z.object({
    id: z.number().int().positive(),
    de: name,
    en: name,
    aliases: z.array(name).max(30).transform((list) => [...new Set(list.filter(Boolean))]),
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
            handEdited: true,
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

const id = z.number().int().positive();
const unit = z.string().trim().max(40);
const amount = z.number().positive().max(100_000);
const postBody = z.discriminatedUnion('action', [
    z.object({ action: z.literal('merge'), into: id, from: z.array(id).min(1).max(50) }),
    z.object({ action: z.literal('notDouble'), a: id, b: id }),
    z.object({ action: z.literal('sameAgain'), a: id, b: id }),
    z.object({ action: z.literal('resolveUnit'), id, unit, a: amount, b: amount, choice: z.enum(['convert', 'keep']) }),
    z.object({ action: z.literal('removeUnit'), id, family: z.string().max(40) }),
    z.object({ action: z.literal('saveUnits'), id, main: unit, rows: z.array(z.object({ unit, a: amount, b: amount })).max(12) }),
    z.object({ action: z.literal('setMain'), id, unit: unit.nullable() }),
    z.object({ action: z.literal('setRowAmount'), rowId: id, amount: z.string().trim().min(1).max(60) }),
    z.object({ action: z.literal('renameItem'), id, name: z.string().trim().min(1).max(120), locale: z.enum(['de', 'en']) }),
    z.object({ action: z.literal('aiResolve'), double: z.tuple([id, id]).optional(), unit: z.object({ itemId: id, family: z.string().max(40) }).optional() }),
    z.object({
        action: z.literal('aiRow'),
        question: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('alike'), name: z.string().max(200), options: z.array(z.object({ id, name: z.string().max(120) })).min(1).max(5) }),
            z.object({ kind: z.literal('unit'), name: z.string().max(200), main: unit, unit, amount: z.string().max(60) }),
        ]),
    }),
    z.object({ action: z.literal('create'), de: name, en: name }),
    z.object({ action: z.literal('giveName'), id, language: z.enum(['de', 'en']), name: z.string().trim().min(1).max(120) }),
    z.object({ action: z.literal('linkAll') }),
    z.object({ action: z.literal('deleteUnused') }),
    z.object({ action: z.literal('aiCheck') }),
    z.object({ action: z.literal('aiTranslate') }),
]);

export const POST = route({ access: 'admin', body: postBody, label: 'Tidying the ingredient catalogue' }, async ({ body, user }) => {
    switch (body.action) {
        case 'merge':
            return NextResponse.json(await merge(body.into, body.from.filter((other) => other !== body.into), user.name));
        case 'notDouble':
            await markDifferent(body.a, body.b);
            return NextResponse.json({ ok: true });
        case 'sameAgain':
            await markDifferent(body.a, body.b, false);
            return NextResponse.json({ ok: true });
        case 'resolveUnit': {
            if (measureOf(unitKey(body.unit)) === null) refuse(400, 'That unit is not known.');
            return NextResponse.json(await resolveUnit(body.id, unitKey(body.unit), body.a, body.b, body.choice, user.name));
        }
        case 'removeUnit':
            await removeUnit(body.id, body.family);
            return NextResponse.json({ ok: true });
        case 'saveUnits': {
            const main = unitKey(body.main);
            if (measureOf(main) === null) refuse(400, 'That unit is not known.');
            return NextResponse.json({ recipes: await saveUnits(body.id, main, body.rows.map((row) => ({ ...row, unit: unitKey(row.unit) })), user.name) });
        }
        case 'setMain': {
            const main = body.unit === null ? null : unitKey(body.unit);
            if (main !== null && measureOf(main) === null) refuse(400, 'That unit is not known.');
            return NextResponse.json({ recipes: await setMainUnit(body.id, main, user.name) });
        }
        case 'setRowAmount':
            return NextResponse.json({ replaced: await setRowAmount(body.rowId, body.amount, user.name) });
        case 'renameItem':
            return NextResponse.json(await renameItem(body.id, body.name, body.locale, user.name));
        case 'aiResolve': {
            const done = await aiResolve(body.double ? { double: body.double } : body.unit ? { unit: body.unit } : null, user.name);
            if (!done) refuse(501, 'The AI is switched off or has no key.');
            return NextResponse.json(done);
        }
        case 'aiRow': {
            const answer = await aiRow(body.question);
            if (!answer) refuse(501, 'The AI is switched off or has no key.');
            return NextResponse.json(answer);
        }
        case 'giveName':
            // "The German version of an English card": its missing name, or the two halves made one (giveName).
            return NextResponse.json({ outcome: await giveName(body.id, body.language, body.name, user.name) });
        case 'create': {
            // A card made by hand (admin → Zutaten "+ Neue Zutat"): kept even before a recipe uses it.
            const de = germanName(body.de);
            if (!de && !body.en) refuse(400, 'An ingredient needs a name.');
            const keys = itemKeys({ de, en: body.en, aliases: [] });
            const clash = await prisma.ingredientItem.findFirst({ where: { keys: { hasSome: keys } }, select: { id: true } });
            if (clash) refuse(409, 'That ingredient is already in the list.');
            const created = await prisma.ingredientItem.create({ data: { de, en: body.en, keys, handEdited: true }, select: { id: true } });
            return NextResponse.json(created);
        }
        case 'linkAll':
            return NextResponse.json(await linkAllUnlinked(2000));
        case 'deleteUnused':
            return NextResponse.json({ deleted: await deleteUnused() });
        default:
            return NextResponse.json(await aiNames(body.action));
    }
});

/**
 * The ingredient we have, overwritten with a new name ("Nudeln" → "Pasta"):
 * the old name stays a further name, and the recipes' rows are renamed in
 * that language, as when two are merged.
 */
async function renameItem(itemId: number, wanted: string, locale: 'de' | 'en', editedBy: string) {
    const item = await prisma.ingredientItem.findUnique({ where: { id: itemId }, select: { de: true, en: true, aliases: true } });
    if (!item) refuse(404, 'That ingredient is gone.');
    const next = locale === 'de' ? germanName(wanted) : wanted;
    const old = item[locale];
    const renamed = { ...item, [locale]: next, aliases: [...new Set([...item.aliases, ...(old && old !== next ? [old] : [])])].filter((alias) => alias !== next).slice(0, 60) };
    const clash = await prisma.ingredientItem.findFirst({ where: { id: { not: itemId }, keys: { hasSome: itemKeys({ de: next, en: '', aliases: [] }) } }, select: { id: true } });
    if (clash) refuse(409, 'Another ingredient already has that name. Merge the two instead.');
    await prisma.ingredientItem.update({ where: { id: itemId }, data: { [locale]: next, aliases: renamed.aliases, keys: itemKeys(renamed), handEdited: true } });
    const recipes = await rewriteRows(
        [itemId],
        (row, language) => {
            if (row.itemId !== itemId || language !== locale) return null;
            const shape = shapeOf(row.name);
            if (!shape.base || shape.base.startsWith('#') || shoppingKey(shape.base) === shoppingKey(next)) return null;
            return { name: formatShape({ ...shape, base: next }) };
        },
        editedBy
    );
    return { renamed: true, recipes };
}

/** The AI asked about the names: doubles the rules miss (kept as questions) and missing names (filled). */
async function aiNames(action: 'aiCheck' | 'aiTranslate') {
    const ai = await aiCapability();
    if (!canUseAi(ai)) refuse(501, 'The AI is switched off or has no key.');
    const items = await prisma.ingredientItem.findMany({ select: { id: true, de: true, en: true, aliases: true } });
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
    const translation = z.object({ id: z.number(), de: z.string().optional(), en: z.string().optional() });
    const fill = async (rows: z.infer<typeof translation>[]) => {
        let filled = 0;
        for (const row of rows) {
            const item = items.find((candidate) => candidate.id === row.id);
            if (!item || (item.de && item.en)) continue;
            // As a recipe's translation does: a name another card has makes the two one, or a question (giveName).
            const language = item.de ? 'en' : 'de';
            const outcome = await giveName(item.id, language, (language === 'de' ? row.de : row.en) ?? '', null);
            if (outcome !== 'kept') filled += 1;
        }
        return filled;
    };
    try {
        if (action === 'aiCheck') {
            const answer = z
                .object({ doubles: z.array(z.array(z.number())).default([]), translations: z.array(translation).default([]) })
                .safeParse(await ask(CHECK_PROMPT, items.map((item) => `${item.id}: ${item.de || '—'} | ${item.en || '—'}`).join('\n')));
            if (!answer.success) refuse(502, 'The AI did not answer usefully. Nothing was changed.');
            // Its doubles become questions ("the same ingredient?"), each pair of a group against the first.
            const pairs = answer.data.doubles
                .map((group) => [...new Set(group.filter((other) => known.has(other)))])
                .filter((group) => group.length > 1)
                .flatMap((group) => group.slice(1).map((other) => [group[0], other] as [number, number]));
            await addAiDoubles(pairs);
            return { doubles: pairs.length, filled: await fill(answer.data.translations) };
        }
        const missing = items.filter((item) => !item.de || !item.en).slice(0, 150);
        if (missing.length === 0) return { filled: 0 };
        const answer = z
            .object({ translations: z.array(translation).default([]) })
            .safeParse(await ask(TRANSLATE_PROMPT, missing.map((item) => `${item.id}: ${item.de || '—'} | ${item.en || '—'}`).join('\n')));
        if (!answer.success) refuse(502, 'The AI did not answer usefully. Nothing was changed.');
        return { filled: await fill(answer.data.translations) };
    } finally {
        await usage.flush();
    }
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
