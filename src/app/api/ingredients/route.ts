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

/**
 * The ingredient catalogue for admin → Zutaten (lib/ingredientCatalog).
 *
 * GET: every ingredient with how many recipe rows use it, the probable
 *   doubles found by rules (lib/ingredientDoubles), and whether an AI can help.
 * PATCH {id, de, en, aliases}: names corrected; what it is found by follows.
 * DELETE ?id=: an ingredient no recipe uses any more.
 * POST {action}:
 *   merge {into, from}: several into one — rows, shopping lines and names move over;
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
        select: { id: true, de: true, en: true, aliases: true, buyMeasure: true, factors: true, createdAt: true, _count: { select: { ingredients: true } } },
    });
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
    }));
}

export const GET = route({ access: 'admin', label: 'The ingredient catalogue' }, async () => {
    const [items, skip, ai, unlinked] = await Promise.all([
        catalogue(),
        notDoubles(),
        aiCapability(),
        prisma.ingredient.count({ where: { itemId: null } }),
    ]);
    return NextResponse.json({ items, doubles: findDoubles(items, skip), aiAvailable: canUseAi(ai), unlinked });
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
]);

export const POST = route({ access: 'admin', body: postBody, label: 'Tidying the ingredient catalogue' }, async ({ body }) => {
    if (body.action === 'merge') return NextResponse.json(await merge(body.into, body.from.filter((id) => id !== body.into)));

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
async function merge(into: number, from: number[]) {
    if (from.length === 0) refuse(400, 'Merge which ingredients?');
    return prisma.$transaction(async (tx) => {
        const kept = await tx.ingredientItem.findUnique({ where: { id: into }, select: { de: true, en: true, aliases: true } });
        const gone = await tx.ingredientItem.findMany({ where: { id: { in: from } }, select: { de: true, en: true, aliases: true } });
        if (!kept || gone.length === 0) refuse(404, 'That ingredient is gone.');
        const de = germanName(kept.de || gone.find((item) => item.de)?.de || '');
        const en = kept.en || gone.find((item) => item.en)?.en || '';
        const aliases = [...new Set([...kept.aliases, ...gone.flatMap((item) => [item.de, item.en, ...item.aliases])].filter((alias) => alias && alias !== de && alias !== en))].slice(0, 60);
        await tx.ingredient.updateMany({ where: { itemId: { in: from } }, data: { itemId: into } });
        await tx.shoppingItem.updateMany({ where: { itemId: { in: from } }, data: { itemId: into } });
        await tx.ingredientItem.deleteMany({ where: { id: { in: from } } });
        await tx.ingredientItem.update({ where: { id: into }, data: { de, en, aliases, keys: itemKeys({ de, en, aliases }) } });
        return { merged: gone.length };
    });
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
