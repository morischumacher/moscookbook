import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { linkAllUnlinked } from '@/lib/ingredientCatalog';
import { capitalized } from '@/lib/ingredientParts';
import { unitOverview } from '@/lib/ingredientUnitsDb';
import { aiCapability } from '@/lib/aiConfig';
import { canUseAi } from '@/lib/aiProviders';

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
        select: { id: true, de: true, en: true, aliases: true, enAliases: true, keys: true, buyMeasure: true, factors: true, unit: true, moreUnits: true, createdAt: true, _count: { select: { ingredients: true } } },
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
        // As the cookbook writes every name: "Rote Zwiebeln", "Spring onions".
        names.push(capitalized(name));
    };
    // Only in the language asked for — the German part of a recipe is offered German names, the English part
    // English ones; a card with no name in it yet is offered by the hint instead ("the German version of …").
    for (const item of items) if (item[locale]) add(item[locale]);
    for (const item of items) for (const alias of locale === 'de' ? item.aliases : item.enAliases) add(alias);
    const catalog = items.map((item) => {
        const entry = overview.get(item.id);
        return {
            id: item.id,
            de: item.de,
            en: item.en,
            aliases: item.aliases,
            enAliases: item.enAliases,
            keys: item.keys,
            unit: entry?.state.unit ?? null,
            moreUnits: item.moreUnits,
            units: entry?.units ?? null,
        };
    });
    return NextResponse.json({ names, items: catalog, aiAvailable: canUseAi(await aiCapability()) }, { headers: { 'Cache-Control': 'private, max-age=60' } });
});
