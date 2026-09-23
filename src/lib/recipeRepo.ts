import prisma from './prisma';
import { slugify } from './recipe';
import { searchFields } from './searchText';
import type { StructuredIngredient } from './ingredientParts';

/**
 * How a recipe is written, in one place.
 *
 * Three routes create recipes — the form, the inbox and the archive restore —
 * and one updates them, and each spelled the write out in full: the columns,
 * the search columns, the ingredients with their positions, the pictures with
 * theirs. The search columns are the part that fails silently (the recipe
 * saves, looks right, and never turns up in a search), which is why
 * `check:search` exists; with the write in one place there is one place for it
 * to be right.
 *
 * Only data is built here. The routes still own their transactions and their
 * error handling, which differ for good reasons: the restore replaces rows,
 * the inbox claims a capture first, an edit also deletes the pictures it
 * stopped pointing at.
 */

export interface RecipeFields {
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    nationality: string | null;
    instructions: string;
    servings: number | null | undefined;
    prepMinutes: number | null | undefined;
    cookMinutes: number | null | undefined;
    /** In the order they are listed. */
    ingredients: StructuredIngredient[];
    /** Left as they are when not given. See lib/tags.ts. */
    tags?: string[];
    /** Every category and cuisine; the first is `category` / `nationality`. Left as they are when not given. */
    categories?: string[];
    cuisines?: string[];
    /** 0–3 chillies. Left as it is when not given. */
    spiciness?: number;
}

/** Every column a recipe's own text decides — the search columns included. */
export function recipeColumns(fields: RecipeFields) {
    return {
        title: fields.title,
        slug: fields.slug,
        description: fields.description,
        // The lists win when given; the single columns are their first entry
        // (and a trigger keeps the two in step for every other writer).
        ...(fields.categories !== undefined
            ? { categories: fields.categories, category: fields.categories[0] ?? null }
            : { category: fields.category }),
        ...(fields.cuisines !== undefined
            ? { cuisines: fields.cuisines, nationality: fields.cuisines[0] ?? null }
            : { nationality: fields.nationality }),
        ...(fields.spiciness !== undefined ? { spiciness: fields.spiciness } : {}),
        instructions: fields.instructions,
        servings: fields.servings ?? null,
        prepMinutes: fields.prepMinutes ?? null,
        cookMinutes: fields.cookMinutes ?? null,
        ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
        ...searchFields({
            title: fields.title,
            description: fields.description,
            instructions: fields.instructions,
            ingredients: fields.ingredients.map((row) => row.name),
        }),
    };
}

/** Ingredient rows for one recipe, positioned in the order given. */
export function ingredientRows(ingredients: StructuredIngredient[]) {
    return ingredients.map((row, index) => ({
        position: index,
        quantity: row.quantity,
        quantityMax: row.quantityMax,
        unit: row.unit,
        name: row.name,
        raw: row.raw,
        section: row.section ?? null,
    }));
}

/**
 * The `data` of a `prisma.recipe.create`: the columns, and the ingredients and
 * pictures nested, each in the order it was arranged — `position` is what
 * keeps that order, since an id-ordered read would reshuffle a gallery
 * whenever a picture was replaced.
 */
export function newRecipeData(
    fields: RecipeFields & {
        imageUrls: string[];
        isDraft?: boolean;
        isPublic?: boolean;
        createdAt?: Date;
    }
) {
    return {
        ...recipeColumns(fields),
        ...(fields.isDraft !== undefined ? { isDraft: fields.isDraft } : {}),
        ...(fields.isPublic !== undefined ? { isPublic: fields.isPublic } : {}),
        ...(fields.createdAt !== undefined ? { createdAt: fields.createdAt } : {}),
        images: { create: fields.imageUrls.map((url, index) => ({ url, position: index })) },
        ingredients: { create: ingredientRows(fields.ingredients) },
    };
}

/**
 * An address no other recipe has: the title's, or the title's with "-2",
 * "-3". For writers that must not stop to ask — the inbox, an import of three
 * hundred recipes — where the same dish arriving twice is a thing that
 * happens and "-2" beats an error.
 */
export async function freeRecipeSlug(title: string): Promise<string> {
    const base = slugify(title) || 'rezept';

    for (let attempt = 0; attempt < 50; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
        const taken = await prisma.recipe.findUnique({ where: { slug: candidate }, select: { id: true } });
        if (!taken) return candidate;
    }

    return `${base}-${Date.now()}`;
}
