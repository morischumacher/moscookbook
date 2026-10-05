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
        select: { de: true, en: true, aliases: true, _count: { select: { ingredients: true } } },
    });
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
    return NextResponse.json({ names }, { headers: { 'Cache-Control': 'private, max-age=60' } });
});
