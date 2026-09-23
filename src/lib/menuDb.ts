import prisma from './prisma';
import { isPrismaError } from './prismaErrors';
import { slugify } from './recipe';
import { itemsFromCourses, type MenuInput } from './menu';
import { linesFor, type PlannedLine } from './shopping';

async function freeMenuSlug(title: string, except?: number): Promise<string> {
    const base = slugify(title) || 'menue';
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
        const taken = await prisma.menu.findUnique({ where: { slug: candidate }, select: { id: true } });
        if (!taken || taken.id === except) return candidate;
    }
    return `${base}-${Date.now()}`;
}

async function itemsFor(input: MenuInput) {
    const ids = input.courses.flatMap((course) => course.dishes.map((dish) => dish.recipeId).filter((id): id is number => id !== null));
    const recipes = ids.length
        ? await prisma.recipe.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })
        : [];
    const titles = new Map(recipes.map((recipe) => [recipe.id, recipe.title]));
    // A recipe deleted while the form was open becomes words on the card.
    return itemsFromCourses(input.courses, (id) => titles.get(id)).map((item) => ({
        ...item,
        recipeId: item.recipeId !== null && titles.has(item.recipeId) ? item.recipeId : null,
    }));
}

function columns(input: MenuInput) {
    return {
        title: input.title,
        occasion: input.occasion,
        date: input.date,
        guests: input.guests,
        style: input.style,
        intro: input.intro,
    };
}

/** Once more when the slug was taken between finding it and writing it. */
async function slugRetry<T>(write: () => Promise<T>): Promise<T> {
    try {
        return await write();
    } catch (error) {
        if (isPrismaError(error, 'P2002')) return write();
        throw error;
    }
}

export async function createMenu(input: MenuInput) {
    const items = await itemsFor(input);
    return slugRetry(async () =>
        prisma.menu.create({
            data: { ...columns(input), slug: await freeMenuSlug(input.title), items: { create: items } },
            select: { id: true, slug: true },
        })
    );
}

export async function updateMenu(id: number, input: MenuInput) {
    const items = await itemsFor(input);
    const [menu] = await slugRetry(async () => prisma.$transaction([
        prisma.menu.update({
            where: { id },
            data: { ...columns(input), slug: await freeMenuSlug(input.title, id) },
            select: { id: true, slug: true },
        }),
        prisma.menuItem.deleteMany({ where: { menuId: id } }),
        prisma.menuItem.createMany({ data: items.map((item) => ({ ...item, menuId: id })) }),
    ]));
    return menu;
}

/**
 * Every recipe on a menu, for the shopping list, scaled to the number of
 * guests: a recipe for four on a menu for eight is bought twice over. With
 * no number of guests, each recipe at its own servings.
 */
export async function menuLines(menuId: number): Promise<PlannedLine[] | null> {
    const menu = await prisma.menu.findUnique({
        where: { id: menuId },
        select: {
            guests: true,
            items: {
                // Not an "only me" recipe: the list is somebody's, and a menu's
                // guests are not the admin.
                where: { recipeId: { not: null }, recipe: { onlyMe: false } },
                orderBy: { position: 'asc' },
                select: {
                    recipe: {
                        select: {
                            title: true,
                            servings: true,
                            ingredients: { orderBy: { position: 'asc' }, select: { name: true, quantity: true, quantityMax: true, unit: true } },
                        },
                    },
                },
            },
        },
    });
    if (!menu) return null;

    return menu.items.flatMap(({ recipe }) => {
        if (!recipe) return [];
        const factor = menu.guests && recipe.servings ? menu.guests / recipe.servings : 1;
        return linesFor(recipe.ingredients, factor, recipe.title);
    });
}
