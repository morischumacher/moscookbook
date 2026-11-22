import { z } from 'zod';
import { slugify } from './recipe';

/**
 * What a collection is allowed to be.
 *
 * Short everywhere. A collection is a label on a handful of recipes, and a
 * label that needs a paragraph is a blog entry — which this application
 * already has, and which can point at a recipe.
 */

const MAX_TITLE = 80;
// Room for a few paragraphs: a collection is often introduced — the menu,
// the occasion, what to make first — and one line was not enough for that.
const MAX_DESCRIPTION = 5000;
const MAX_SLUG = 80;

/** Enough for a menu, few enough that the page stays a page. */
export const MAX_RECIPES_PER_COLLECTION = 60;

export const collectionInputSchema = z.object({
    title: z.string().trim().min(1, 'A collection needs a name.').max(MAX_TITLE),
    description: z
        .string()
        .trim()
        .max(MAX_DESCRIPTION)
        .nullable()
        .optional()
        .transform((value) => (value ? value : null)),
    /**
     * The address, when somebody typed one. Empty means "let the app choose":
     * derived from the title for a new collection, and kept as it is for one
     * that already has an address (see the routes).
     */
    slug: z
        .string()
        .trim()
        .max(MAX_SLUG)
        .nullable()
        .optional()
        .transform((value) => (value ? value : null))
        .refine((value) => value === null || slugify(value).length > 0, 'The address needs letters or digits.')
        .transform((value) => (value === null ? null : slugify(value))),
    /**
     * In the order they were arranged. Duplicates are removed rather than
     * refused: dragging a recipe onto a list it is already on is a mistake
     * with an obvious intention.
     */
    /** Uploaded to our store by the form. Empty means none. */
    imageUrl: z
        .string()
        .trim()
        .max(2048)
        .refine((value) => value === '' || /^https?:\/\//i.test(value), 'The picture has to be an http(s) link')
        .nullable()
        .optional()
        .transform((value) => value || null),
    recipeIds: z
        .array(z.number().int().positive().max(2_147_483_647))
        .max(MAX_RECIPES_PER_COLLECTION)
        .default([])
        .transform((ids) => [...new Set(ids)]),
});

export type CollectionInput = z.infer<typeof collectionInputSchema>;

/**
 * The address a collection lives at, when nobody typed one.
 *
 * Derived from the title once, when the collection is made, and then left
 * alone: a public collection gets linked to from outside (a CV, a message),
 * and renaming it must not break those links. Changing the address is a
 * deliberate act in the form, never a side effect of a new name.
 */
export function collectionSlug(title: string): string {
    return slugify(title) || 'sammlung';
}

/** The first line of the error, in the shape the routes already answer with. */
// The one formatter, which names the field. `formatCollectionError` was the same
// one-liner as its sibling and dropped the field name.
export { formatZodError as formatCollectionError } from './zodMessage';
