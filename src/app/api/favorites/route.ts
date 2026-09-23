import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';

/** The addresses of this person's favourites, for keeping them offline. */
export const GET = route({ access: 'user', label: 'Favourites' }, async ({ user }) => {
    const favorites = await prisma.favorite.findMany({
        where: { userId: user.id, recipe: { isDraft: false } },
        select: { recipe: { select: { slug: true } } },
        take: 200,
    });
    return NextResponse.json({ slugs: favorites.map((row) => row.recipe.slug) });
});
