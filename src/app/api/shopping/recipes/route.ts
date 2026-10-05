import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { visibleTo } from '@/lib/recipeVisibility';

/**
 * Recipes to put on a shopping list, found by name from the list itself
 * ("Rezepte auf der Liste" → add one), in either language. Eight at most:
 * a search, not a catalogue.
 */
export const GET = route({ access: 'user', label: 'Finding recipes for the shopping list' }, async ({ req, user }) => {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ recipes: [] });
    const rows = await prisma.recipe.findMany({
        where: {
            isDraft: false,
            ...visibleTo(user),
            OR: [{ title: { contains: q, mode: 'insensitive' } }, { translations: { some: { title: { contains: q, mode: 'insensitive' } } } }],
        },
        orderBy: { title: 'asc' },
        take: 8,
        select: { id: true, title: true, servings: true, translations: { select: { locale: true, title: true } } },
    });
    return NextResponse.json({ recipes: rows });
});
