import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { linkAllUnlinked } from '@/lib/ingredientCatalog';

/**
 * The names the ingredient field suggests while typing: the cookbook's
 * catalogue of ingredients (lib/ingredientCatalog) in the language of the
 * page — "Frü" on the German page offers "Frühlingszwiebeln", "spr" on the
 * English one "spring onions" — the most used first, with their other names
 * after. Choosing one gives the row the name the catalogue already knows, so
 * the same thing is the same ingredient everywhere. For the recipe form,
 * which is the admin's.
 *
 * Also where recipes from before the catalogue are given their ingredients,
 * a batch at a time, the first times the form is opened.
 */
export const GET = route({ access: 'admin', label: 'Ingredient names for the form' }, async ({ req }) => {
    const locale = new URL(req.url).searchParams.get('locale') === 'en' ? 'en' : 'de';
    await linkAllUnlinked(100).catch(() => undefined);
    const items = await prisma.ingredientItem.findMany({
        select: { id: true, de: true, en: true, aliases: true, _count: { select: { ingredients: true } } },
    });
    // The unit each is usually written with ("Minze" → "Bund"), offered when a row has none yet.
    // Rows with no unit count too: onions usually counted are not offered the one "1 kg".
    const used = await prisma.ingredient.groupBy({ by: ['itemId', 'unit'], where: { itemId: { not: null } }, _count: { _all: true } });
    const usual = new Map<number, { unit: string; count: number }>();
    for (const row of used) {
        const unit = (row.unit ?? '').trim();
        if (row.itemId === null) continue;
        const best = usual.get(row.itemId);
        if (!best || row._count._all > best.count) usual.set(row.itemId, { unit, count: row._count._all });
    }
    const units: Record<string, string> = {};
    items.sort((a, b) => b._count.ingredients - a._count.ingredients);
    const seen = new Set<string>();
    const names: string[] = [];
    const add = (name: string) => {
        const key = name.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        names.push(name.trim());
    };
    // Each in the page's language first, else the other; then every other name it goes by.
    for (const item of items) add(locale === 'de' ? item.de || item.en : item.en || item.de);
    for (const item of items) for (const alias of item.aliases) add(alias);
    for (const item of items) {
        const unit = usual.get(item.id)?.unit;
        if (unit) for (const name of [item.de, item.en, ...item.aliases]) if (name.trim()) units[name.trim().toLowerCase()] = unit;
    }
    return NextResponse.json({ names, units }, { headers: { 'Cache-Control': 'private, max-age=60' } });
});
