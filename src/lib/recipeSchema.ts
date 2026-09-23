import { z } from 'zod';
import { normaliseTags } from './tags';
import { slugify } from './recipe';
import { RECIPE_LANGUAGES, translationSchema } from './recipeTranslation';

const ingredientSchema = z.object({
    amount: z.string().trim().max(120).default(''),
    item: z.string().trim().min(1, 'Ingredient name is required').max(200),
});

/**
 * An absolute http(s) URL, or an empty string meaning "this recipe has no image".
 * The protocol check matters: zod's `.url()` happily accepts `javascript:…`,
 * which would end up in an image `src` attribute.
 */
const imageUrlSchema = z.union([
    z
        .string()
        .trim()
        .max(2048)
        .refine((value) => {
            try {
                const { protocol } = new URL(value);
                return protocol === 'https:' || protocol === 'http:';
            } catch {
                return false;
            }
        }, 'Image URL must be an absolute http(s) URL'),
    z.literal(''),
]);

function uniqueList(list: string[] | undefined): string[] | undefined {
    return list === undefined ? undefined : [...new Set(list)];
}

export const recipeInputSchema = z.object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    slug: z
        .string()
        .trim()
        .transform((value) => slugify(value))
        .refine((value) => value.length > 0, 'Slug is required'),
    description: z.string().trim().max(4000).default(''),
    category: z.string().trim().max(100).default(''),
    nationality: z.string().trim().max(100).default(''),
    /**
     * Every category and cuisine, at most five each. Given, they win over
     * the single fields above (see recipeColumns).
     */
    categories: z.array(z.string().trim().min(1).max(60)).max(5).optional().transform(uniqueList),
    cuisines: z.array(z.string().trim().min(1).max(60)).max(5).optional().transform(uniqueList),
    spiciness: z.number().int().min(0).max(3).optional(),
    // A recipe without ingredients cannot be shopped for, scaled or cooked
    // from; the form will not save one.
    ingredients: z.array(ingredientSchema).min(1, 'Add at least one ingredient').max(200),
    tags: z.array(z.string().max(60)).max(30).default([]).transform(normaliseTags),
    instructions: z.string().trim().min(1, 'Instructions are required').max(50_000),
    // Optional: an existing recipe without these simply does not show them.
    servings: z.number().int().min(1).max(100).nullable().optional(),
    prepMinutes: z.number().int().min(0).max(10_000).nullable().optional(),
    cookMinutes: z.number().int().min(0).max(10_000).nullable().optional(),
    // Left out entirely = keep whatever pictures the recipe already has.
    // An empty array means "remove them all", which is a different thing.
    imageUrls: z.array(imageUrlSchema).max(12).optional(),
    /**
     * The single-picture form this API had before galleries. Still accepted,
     * because the capture inbox and older clients send it, and because a
     * breaking change to an endpoint costs more than four lines of kindness.
     */
    imageUrl: imageUrlSchema.optional(),
    /** Only the admins see it. Left as it is when not given. See lib/recipeVisibility. */
    onlyMe: z.boolean().optional(),
    /** The language it is written in. Left as it is when not given. */
    language: z.enum(RECIPE_LANGUAGES).optional(),
    /**
     * The recipe in its other language (lib/recipeTranslation.ts). Left as it
     * is when not given; null removes it.
     */
    translation: translationSchema.nullable().optional(),
});

/**
 * The pictures a request is asking for, or null for "leave them alone".
 *
 * One place decides this, so the create route and the edit route cannot
 * disagree about what an absent field means.
 */
export function resolveImageUrls(input: {
    imageUrls?: string[];
    imageUrl?: string;
}): string[] | null {
    if (input.imageUrls !== undefined) return input.imageUrls.filter((url) => url !== '');
    if (input.imageUrl !== undefined) return input.imageUrl === '' ? [] : [input.imageUrl];
    return null;
}

export type RecipeInput = z.infer<typeof recipeInputSchema>;

export { formatZodError } from './zodMessage';
