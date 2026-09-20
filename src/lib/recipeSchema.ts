import { z } from 'zod';
import { slugify } from './recipe';

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
    ingredients: z.array(ingredientSchema).max(200).default([]),
    instructions: z.string().trim().min(1, 'Instructions are required').max(50_000),
    // Optional: an existing recipe without these simply does not show them.
    servings: z.number().int().min(1).max(100).nullable().optional(),
    prepMinutes: z.number().int().min(0).max(10_000).nullable().optional(),
    cookMinutes: z.number().int().min(0).max(10_000).nullable().optional(),
    // Left out entirely = keep whatever image the recipe already has.
    imageUrl: imageUrlSchema.optional(),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;

/** Turns a ZodError into a single readable sentence for the client. */
export function formatZodError(error: z.ZodError): string {
    return error.issues
        .map((issue) => {
            const path = issue.path.join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
}
