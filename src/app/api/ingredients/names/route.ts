import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { linkAllUnlinked } from '@/lib/ingredientCatalog';
import { germanName } from '@/lib/ingredientNames';
import { unitOverview } from '@/lib/ingredientUnitsDb';

/**
 * The names the ingredient field suggests while typing: the cookbook's
 * catalogue of ingredients (lib/ingredientCatalog) in the language of the
 * page — "Frü" on the German page offers "Frühlingszwiebeln", "spr" on the
 * English one "spring onions" — the most used first, with their other names
 * after. Choosing one gives the row the name the catalogue already knows, so
 * the same thing is the same ingredient everywhere. For the recipe form,
 * which is the admin's. With every ingredient's names, standard unit and
 * conversions, so the form can say "that one you have, usually in g" or
 * "new — but Nudeln looks alike" (lib/ingredientMatch, lib/ingredientUnits).
 *
 * Also where recipes from before the catalogue are given their ingredients,
 * a batch at a time, the first times the form is opened.
 */
export const GET = route({ access: 'admin', label: 'Ingredient names for the form' }, async ({ req }) => {
    const locale = new URL(req.url).searchParams.get('locale') === 'en' ? 'en' : 'de';
    await linkAllUnlinked(100).catch(() => undefined);
    const items = await prisma.ingredientItem.findMany({
        select: { id: true, de: true, en: true, aliases: true, keys: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true, _count: { select: { ingredients: true } } },
    });
    // Each with its standard unit ("Minze" → Bund): offered to a row with none
    // yet, and the reason for "Pasta is usually in g" when a row says otherwise.
    const overview = await unitOverview(items);
    items.sort((a, b) => b._count.ingredients - a._count.ingredients);
    const seen = new Set<string>();
    const names: string[] = [];
    const add = (name: string) => {
        const key = name.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        // On the German page as a German list writes it: "Rote Zwiebeln", "Lauchzwiebel".
        names.push(locale === 'de' ? germanName(name) : name.trim());
    };
    // Each in the page's language first, else the other; then every other name it goes by.
    for (const item of items) add(locale === 'de' ? item.de || item.en : item.en || item.de);
    for (const item of items) for (const alias of item.aliases) add(alias);
    const catalog = items.map((item) => {
        const entry = overview.get(item.id);
        return {
            id: item.id,
            de: item.de,
            en: item.en,
            aliases: item.aliases,
            keys: item.keys,
            unit: entry?.state.unit ?? null,
            moreUnits: item.moreUnits,
            units: entry?.units ?? null,
        };
    });
    return NextResponse.json({ names, items: catalog }, { headers: { 'Cache-Control': 'private, max-age=60' } });
});
