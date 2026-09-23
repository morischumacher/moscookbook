import { z } from 'zod';

/**
 * Menus: an evening, in courses.
 *
 * Each dish is either one of the cookbook's recipes or just words ("Brot und
 * Butter", "Käse vom Markt") — a menu card describes the evening, and not
 * everything on the table was cooked from a recipe. A dish from a recipe
 * carries the recipe's title unless it is given a better one for the card.
 */

export const MENU_STYLES = ['casual', 'chic', 'festive'] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

export function menuStyle(value: string | null | undefined): MenuStyle {
    return (MENU_STYLES as readonly string[]).includes(value ?? '') ? (value as MenuStyle) : 'casual';
}

/**
 * The courses a new menu starts with, by style. A suggestion: courses can be
 * renamed, added and taken away. Three for an evening with friends, four for
 * a date, the long form for Christmas.
 */
export const COURSE_PRESETS: Record<MenuStyle, Record<'de' | 'en', string[]>> = {
    casual: { de: ['Vorspeise', 'Hauptgang', 'Dessert'], en: ['Starter', 'Main', 'Dessert'] },
    chic: {
        de: ['Amuse-Bouche', 'Vorspeise', 'Hauptgang', 'Dessert'],
        en: ['Amuse-bouche', 'Starter', 'Main course', 'Dessert'],
    },
    festive: {
        de: ['Aperitif', 'Vorspeise', 'Suppe', 'Hauptgang', 'Dessert', 'Zum Kaffee'],
        en: ['Apéritif', 'Starter', 'Soup', 'Main course', 'Dessert', 'With coffee'],
    },
};

export const menuInputSchema = z.object({
    title: z.string().trim().min(1, 'A menu needs a name.').max(120),
    occasion: z.string().trim().max(120).optional().transform((value) => value || null),
    date: z
        .string()
        .trim()
        .optional()
        .transform((value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null)),
    guests: z.number().int().min(1).max(200).nullable().optional().transform((value) => value ?? null),
    style: z.enum(MENU_STYLES).default('casual'),
    intro: z.string().trim().max(600).optional().transform((value) => value || null),
    courses: z
        .array(
            z.object({
                name: z.string().trim().min(1).max(60),
                dishes: z
                    .array(
                        z.object({
                            recipeId: z.number().int().positive().nullable().default(null),
                            title: z.string().trim().max(160).default(''),
                            description: z.string().trim().max(240).optional().transform((value) => value || null),
                        })
                    )
                    .max(12),
            })
        )
        .max(12),
});

export type MenuInput = z.infer<typeof menuInputSchema>;

/** The courses as rows: one per dish, the course repeated, positions in order. */
export function itemsFromCourses(courses: MenuInput['courses'], titleOf: (recipeId: number) => string | undefined) {
    let position = 0;
    return courses.flatMap((course) =>
        course.dishes.flatMap((dish) => {
            const title = dish.title || (dish.recipeId ? titleOf(dish.recipeId) : undefined) || '';
            if (!title) return [];
            return [{ position: position++, course: course.name, recipeId: dish.recipeId, title, description: dish.description }];
        })
    );
}

export interface MenuItemRow {
    course: string;
    title: string;
    description: string | null;
    recipeId: number | null;
}

/** Rows back into courses, in order: a course is its consecutive dishes. */
export function coursesOf<T extends MenuItemRow>(items: T[]): { name: string; dishes: T[] }[] {
    const courses: { name: string; dishes: T[] }[] = [];
    for (const item of items) {
        const last = courses[courses.length - 1];
        if (last && last.name === item.course) last.dishes.push(item);
        else courses.push({ name: item.course, dishes: [item] });
    }
    return courses;
}

/**
 * A collection turned into a menu: its desserts into the dessert course, its
 * drinks into the first, everything else into the main course. A first guess
 * for the author to rearrange — nobody's collection is sorted by course.
 * Empty courses keep one empty dish so they are visibly there to fill.
 */
export function coursesFromRecipes(
    recipes: { id: number; title: string; category: string | null }[],
    locale: 'de' | 'en'
): { name: string; dishes: { recipeId: number | null; title: string; description: string }[] }[] {
    const [starter, main, dessert] = COURSE_PRESETS.casual[locale];
    const drinks = locale === 'de' ? 'Aperitif' : 'Apéritif';
    const dish = (recipe: { id: number }) => ({ recipeId: recipe.id, title: '', description: '' });
    const empty = [{ recipeId: null, title: '', description: '' }];

    const drinkDishes = recipes.filter((recipe) => recipe.category === 'Drink').map(dish);
    const dessertDishes = recipes.filter((recipe) => recipe.category === 'Dessert').map(dish);
    const mainDishes = recipes.filter((recipe) => recipe.category !== 'Drink' && recipe.category !== 'Dessert').map(dish);

    return [
        ...(drinkDishes.length ? [{ name: drinks, dishes: drinkDishes }] : []),
        { name: starter, dishes: empty },
        { name: main, dishes: mainDishes.length ? mainDishes : empty },
        { name: dessert, dishes: dessertDishes.length ? dessertDishes : empty },
    ];
}
