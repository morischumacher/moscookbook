import { z } from 'zod';
import { slugify } from './recipe';

/**
 * A written entry.
 *
 * The shape is deliberately small: a title, some Markdown, optionally a
 * picture, optionally a recipe it belongs to. Everything else a blog usually
 * grows — tags, categories, series, authors as a concept — is a thing to add
 * when there is something to put in it.
 *
 * A post never requires a recipe. That is the whole point of `recipeId` being
 * nullable rather than there being two tables: attaching one turns the entry
 * into a dated note on that recipe's page, and not attaching one leaves it an
 * ordinary post. Nothing else about it changes.
 */
export const postInputSchema = z.object({
    title: z.string().trim().min(1, 'A title is required').max(200),

    // Derived from the title when it is left empty, so nobody has to think
    // about it, but editable, because a slug is a permanent address and the
    // person writing may want to choose it.
    slug: z
        .string()
        .trim()
        .max(200)
        .optional()
        .transform((value) => (value ? slugify(value) : '')),

    body: z.string().trim().min(1, 'An entry needs some text').max(100_000),

    imageUrl: z
        .string()
        .trim()
        .max(2048)
        .refine((value) => value === '' || /^https?:\/\//i.test(value), {
            message: 'The picture has to be an http(s) link',
        })
        .optional()
        .transform((value) => value || null),

    recipeId: z.number().int().positive().nullable().optional(),

    // Not a date: the moment is the server's to decide, and a client that can
    // set it could publish something into the past or the future.
    published: z.boolean().optional(),
});

export type PostInput = z.infer<typeof postInputSchema>;

/**
 * The first couple of lines, for a list.
 *
 * Markdown markers are stripped rather than rendered, because a list of entries
 * is not the place to discover that someone opened with a heading. Cut at a
 * word boundary, and only add the ellipsis when something was actually left
 * out — an excerpt that ends in "…" when it is the whole text is a small lie.
 */
export function excerptOf(body: string, limit = 180): string {
    const flat = body
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s{0,3}[-*+]\s+/gm, '')
        .replace(/[*_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (flat.length <= limit) return flat;

    const cut = flat.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// The one formatter, which names the field. `formatPostError` was the same
// one-liner as its sibling and dropped the field name.
export { formatZodError as formatPostError } from './zodMessage';
