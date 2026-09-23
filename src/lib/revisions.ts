import { z } from 'zod';

/**
 * A recipe as it was, and what changed since.
 *
 * Kept as a JSON snapshot rather than as rows mirroring the recipe's own
 * tables: nothing queries inside a revision, it is only ever read whole, and
 * a snapshot cannot drift out of step with a schema it does not share.
 *
 * Pictures are not in it. An edit deletes the files it stops pointing at, so
 * a snapshot's picture addresses would lead nowhere; restoring a version
 * keeps the recipe's pictures as they are now.
 */

const snapshotSchema = z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable().default(null),
    category: z.string().nullable().default(null),
    nationality: z.string().nullable().default(null),
    instructions: z.string().default(''),
    servings: z.number().nullable().default(null),
    prepMinutes: z.number().nullable().default(null),
    cookMinutes: z.number().nullable().default(null),
    tags: z.array(z.string()).default([]),
    ingredients: z
        .array(z.object({ raw: z.string().default(''), name: z.string(), section: z.string().nullable().default(null) }))
        .default([]),
});

export type RecipeSnapshot = z.infer<typeof snapshotSchema>;

export interface SnapshotSource {
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    nationality: string | null;
    instructions: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    tags: string[];
    ingredients: { raw: string; name: string; section: string | null }[];
}

export function snapshotOf(recipe: SnapshotSource): RecipeSnapshot {
    return {
        title: recipe.title,
        slug: recipe.slug,
        description: recipe.description,
        category: recipe.category,
        nationality: recipe.nationality,
        instructions: recipe.instructions,
        servings: recipe.servings,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        tags: recipe.tags,
        ingredients: recipe.ingredients.map((row) => ({ raw: row.raw, name: row.name, section: row.section })),
    };
}

export function readSnapshot(value: unknown): RecipeSnapshot | null {
    const parsed = snapshotSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export type ChangedField = 'title' | 'description' | 'category' | 'times' | 'servings' | 'ingredients' | 'instructions' | 'tags';

/** What differs between two versions, in the words the history shows. */
export function changedFields(before: RecipeSnapshot, after: RecipeSnapshot): ChangedField[] {
    const changed: ChangedField[] = [];
    if (before.title !== after.title) changed.push('title');
    if ((before.description ?? '') !== (after.description ?? '')) changed.push('description');
    if (before.category !== after.category || before.nationality !== after.nationality) changed.push('category');
    if (before.servings !== after.servings) changed.push('servings');
    if (before.prepMinutes !== after.prepMinutes || before.cookMinutes !== after.cookMinutes) changed.push('times');
    if (JSON.stringify(before.ingredients) !== JSON.stringify(after.ingredients)) changed.push('ingredients');
    if (before.instructions.trim() !== after.instructions.trim()) changed.push('instructions');
    if ([...before.tags].sort().join() !== [...after.tags].sort().join()) changed.push('tags');
    return changed;
}

/** How many earlier versions of one recipe are kept. */
export const KEEP_REVISIONS = 30;
