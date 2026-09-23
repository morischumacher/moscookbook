import prisma from './prisma';
import { menuStyle } from './menu';
import type { MenuCardData } from '@/components/menu/MenuCard';

const select = {
    id: true,
    title: true,
    slug: true,
    occasion: true,
    date: true,
    guests: true,
    style: true,
    intro: true,
    shareToken: true,
    items: {
        orderBy: { position: 'asc' as const },
        select: {
            course: true,
            title: true,
            description: true,
            recipeId: true,
            recipe: { select: { slug: true, isDraft: true } },
        },
    },
};

type Row = NonNullable<Awaited<ReturnType<typeof readOne>>>;

function readOne(where: { slug: string } | { shareToken: string } | { id: number }) {
    return prisma.menu.findUnique({ where, select });
}

export interface MenuView extends MenuCardData {
    id: number;
    slug: string;
    shareToken: string | null;
    /** The recipes behind the dishes, for people who may open them. */
    recipes: { title: string; slug: string }[];
}

function shaped(row: Row): MenuView {
    return {
        ...row,
        style: menuStyle(row.style),
        items: row.items.map(({ course, title, description, recipeId }) => ({ course, title, description, recipeId })),
        recipes: row.items.flatMap((item) =>
            item.recipe && !item.recipe.isDraft ? [{ title: item.title, slug: item.recipe.slug }] : []
        ),
    };
}

export async function menuBy(where: { slug: string } | { shareToken: string } | { id: number }): Promise<MenuView | null> {
    const row = await readOne(where);
    return row ? shaped(row) : null;
}
