import prisma from './prisma';
import { germanName } from './ingredientNames';
import { coreName, itemKeys, keysFor, namesIn } from './ingredientMatch';
import { giveName } from './ingredientDecideDb';
import { guessLanguage, storedRows, type RecipeLanguage } from './recipeTranslation';
import { sectionHeading } from './ingredientParts';

/**
 * The cookbook's ingredients, once each, in both languages.
 *
 * Every ingredient row of a recipe points at one (`Ingredient.itemId`). A
 * name is matched against the names it already knows — German, English and
 * further ones — by their folded form, so "Frühlingszwiebeln", "green
 * onions/scallions" and "spring onions" meet; a name it does not know becomes
 * a new one, in the recipe's language. The other language comes from the
 * recipe's own translation where there is one, from the starting list for the
 * common ones, or later from the admin (by hand, or by the AI asked once).
 *
 * Doubles are expected — "Ingwer" and "frischer Ingwerwurzel" from two
 * imports — and are found and merged on admin → Zutaten, with or without AI.
 */

export { coreName, itemKeys, keysFor } from './ingredientMatch';

export interface CatalogItem {
    id: number;
    de: string;
    en: string;
    aliases: string[];
}

/**
 * The item a name already is: every part of it the same one ("green
 * onions/scallions"), or null — also for "chicken breast or firm tofu",
 * which is two things and so no one of them.
 */
type Client = Pick<typeof prisma, 'ingredientItem'>;

export async function matchItem(name: string, client: Client = prisma): Promise<number | null> {
    const parts = namesIn(name);
    if (parts.length === 0) return null;
    let found: number | null = null;
    for (const part of parts) {
        const item = await client.ingredientItem.findFirst({
            where: { keys: { hasSome: keysFor(part) } },
            orderBy: { id: 'asc' },
            select: { id: true },
        });
        if (!item || (found !== null && item.id !== found)) return null;
        found = item.id;
    }
    return found;
}

/** The item for a recipe's ingredient: the one it already is, or a new one in the recipe's language. */
export async function itemFor(name: string, language: RecipeLanguage): Promise<number | null> {
    const known = await matchItem(name);
    if (known !== null) return known;
    const core = coreName(name).slice(0, 120);
    if (!core || /^#/.test(core)) return null;
    // One at a time per name, and looked up again under the lock: two saves
    // (or two pages linking old recipes) at once made "Guanciale" twice.
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ingredient:' + keysFor(core)[0]}))`;
        const again = await matchItem(name, tx);
        if (again !== null) return again;
        const created = await tx.ingredientItem.create({
            data: { de: language === 'de' ? germanName(core) : '', en: language === 'en' ? core : '', keys: keysFor(core) },
            select: { id: true },
        });
        return created.id;
    });
}

/**
 * Every row of a recipe that points at nothing yet, pointed at its item; and
 * an item missing the recipe's other language given it from the recipe's own
 * translation, row for row. Safe to run again: it only fills what is empty.
 */
export async function linkRecipe(recipeId: number): Promise<number> {
    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
        select: {
            language: true,
            title: true,
            ingredients: { orderBy: { position: 'asc' }, select: { id: true, name: true, itemId: true } },
            translations: { select: { locale: true, ingredients: true } },
        },
    });
    if (!recipe) return 0;

    const language: RecipeLanguage = recipe.language === 'en' || recipe.language === 'de' ? recipe.language : guessLanguage([recipe.title, ...recipe.ingredients.map((row) => row.name)].join(' '));
    const other: RecipeLanguage = language === 'de' ? 'en' : 'de';
    const translated = storedRows(recipe.translations.find((row) => row.locale === other)?.ingredients)
        .filter((row) => row.item.trim() !== '' && sectionHeading(row) === null)
        .map((row) => row.item);
    // Row for row only when the two lists are the same length: a guess at
    // which line is which is how "Zucker" becomes the English for salt.
    const aligned = translated.length === recipe.ingredients.length ? translated : null;

    let linked = 0;
    for (const [index, row] of recipe.ingredients.entries()) {
        let itemId = row.itemId;
        if (itemId === null) {
            itemId = await itemFor(row.name, language);
            if (itemId === null) continue;
            await prisma.ingredient.update({ where: { id: row.id }, data: { itemId } });
            linked += 1;
        }
        // The translation's row names the same product in the other language: given to the card — or, when another
        // card has that name, the two halves made one (lib/ingredientDecideDb giveName).
        const otherName = aligned ? coreName(aligned[index]) : '';
        if (otherName) await giveName(itemId, other, otherName, null).catch(() => 'kept');
    }
    return linked;
}

/** Every recipe with a row that points at nothing yet, linked — the existing recipes after the catalogue arrived, and anything written past it. */
export async function linkAllUnlinked(limit = 500): Promise<{ recipes: number; rows: number }> {
    const recipes = await prisma.recipe.findMany({
        where: { ingredients: { some: { itemId: null } } },
        select: { id: true },
        take: limit,
    });
    let rows = 0;
    for (const recipe of recipes) rows += await linkRecipe(recipe.id);

    // And the lines already on shopping lists, so they too are named in the
    // reader's language and merge with what is added next. Only matched,
    // never made: "Klopapier" is no ingredient.
    const lines = await prisma.shoppingItem.findMany({ where: { itemId: null }, select: { id: true, name: true }, take: limit * 4 });
    for (const line of lines) {
        const itemId = await matchItem(line.name);
        if (itemId !== null) await prisma.shoppingItem.update({ where: { id: line.id }, data: { itemId } });
    }
    return { recipes: recipes.length, rows };
}

/**
 * The names the list already has for a recipe's ingredients in another
 * language — "Frühlingszwiebeln" → "spring onions" — for a translation to
 * use (lib/recipeTranslation withGlossary puts them in, whatever the model wrote).
 */
export async function glossaryFor(rows: { item: string }[], to: RecipeLanguage): Promise<Record<string, string>> {
    const glossary: Record<string, string> = {};
    for (const row of rows) {
        const name = coreName(row.item);
        if (!name || name.startsWith('#') || glossary[name]) continue;
        const id = await matchItem(name).catch(() => null);
        const item = id ? await prisma.ingredientItem.findUnique({ where: { id }, select: { de: true, en: true } }) : null;
        if (item?.[to]) glossary[name] = item[to];
    }
    return glossary;
}
