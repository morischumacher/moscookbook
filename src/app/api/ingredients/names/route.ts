import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { commonNames } from '@/lib/ingredientNames';

/**
 * The names the ingredient field suggests while typing: the cookbook's own,
 * most used first, then the common ones in the page's language. Typing
 * "Frü" offers "Frühlingszwiebeln" as it is already written in other
 * recipes, so the same thing gets the same name — which is what the shopping
 * list merges on. For the recipe form, which is the admin's.
 */
export const GET = route({ access: 'admin', label: 'Ingredient names for the form' }, async ({ req }) => {
    const locale = new URL(req.url).searchParams.get('locale') === 'en' ? 'en' : 'de';
    const used = await prisma.ingredient.groupBy({
        by: ['name'],
        _count: { name: true },
        orderBy: { _count: { name: 'desc' } },
        take: 3000,
    });
    const seen = new Set<string>();
    const names: string[] = [];
    for (const name of [...used.map((row) => row.name), ...commonNames(locale)]) {
        const key = name.trim().toLowerCase();
        if (!key || key.startsWith('#') || seen.has(key)) continue;
        seen.add(key);
        names.push(name.trim());
    }
    return NextResponse.json({ names }, { headers: { 'Cache-Control': 'private, max-age=300' } });
});
