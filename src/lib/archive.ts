import { z } from 'zod';

/**
 * The backup format.
 *
 * A cookbook that exists only inside one hosting account is one billing
 * problem away from being gone. This is the shape that gets written out, and
 * the shape that is validated on the way back in — deliberately plain JSON
 * that stays readable without this application.
 *
 * `version` is checked on import: a future format must not be half-read by an
 * older build.
 */

export const ARCHIVE_VERSION = 1;

const archiveIngredientSchema = z.object({
    position: z.number().int().min(0),
    quantity: z.number().nullable().default(null),
    quantityMax: z.number().nullable().default(null),
    unit: z.string().nullable().default(null),
    name: z.string().min(1),
    raw: z.string().default(''),
});

const archiveRecipeSchema = z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().nullable().default(null),
    instructions: z.string().default(''),
    category: z.string().nullable().default(null),
    nationality: z.string().nullable().default(null),
    servings: z.number().int().nullable().default(null),
    prepMinutes: z.number().int().nullable().default(null),
    cookMinutes: z.number().int().nullable().default(null),
    views: z.number().int().min(0).default(0),
    createdAt: z.string().default(() => new Date().toISOString()),
    /** Absolute URLs at the time of export; a local backup also keeps the files. */
    images: z.array(z.string()).default([]),
    ingredients: z.array(archiveIngredientSchema).default([]),
});

export const archiveSchema = z.object({
    version: z.number().int(),
    exportedAt: z.string(),
    recipeCount: z.number().int().min(0).optional(),
    recipes: z.array(archiveRecipeSchema),
});

export type ArchiveRecipe = z.infer<typeof archiveRecipeSchema>;
export type Archive = z.infer<typeof archiveSchema>;

export interface ParseResult {
    ok: boolean;
    archive?: Archive;
    error?: string;
}

/**
 * Reads an archive defensively: this is a file that has been sitting on a disk,
 * possibly edited by hand, possibly written by a different version.
 */
export function parseArchive(input: unknown): ParseResult {
    const parsed = archiveSchema.safeParse(input);

    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path.join('.');
        return {
            ok: false,
            error: path ? `${path}: ${issue?.message}` : (issue?.message ?? 'Not a valid archive'),
        };
    }

    if (parsed.data.version > ARCHIVE_VERSION) {
        return {
            ok: false,
            error: `This archive was written by a newer version (${parsed.data.version}); this build understands up to ${ARCHIVE_VERSION}.`,
        };
    }

    const slugs = new Set<string>();
    for (const recipe of parsed.data.recipes) {
        if (slugs.has(recipe.slug)) {
            return { ok: false, error: `The archive contains two recipes with the slug "${recipe.slug}".` };
        }
        slugs.add(recipe.slug);
    }

    return { ok: true, archive: parsed.data };
}

/** Database rows in, archive out. */
export interface ExportableRecipe {
    title: string;
    slug: string;
    description: string | null;
    instructions: string;
    category: string | null;
    nationality: string | null;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    views: number;
    createdAt: Date;
    images: { url: string }[];
    ingredients: {
        position: number;
        quantity: number | null;
        quantityMax: number | null;
        unit: string | null;
        name: string;
        raw: string;
    }[];
}

export function buildArchive(recipes: ExportableRecipe[], now = new Date()): Archive {
    return {
        version: ARCHIVE_VERSION,
        exportedAt: now.toISOString(),
        recipeCount: recipes.length,
        recipes: recipes.map((recipe) => ({
            title: recipe.title,
            slug: recipe.slug,
            description: recipe.description,
            instructions: recipe.instructions,
            category: recipe.category,
            nationality: recipe.nationality,
            servings: recipe.servings,
            prepMinutes: recipe.prepMinutes,
            cookMinutes: recipe.cookMinutes,
            views: recipe.views,
            createdAt: recipe.createdAt.toISOString(),
            images: recipe.images.map((image) => image.url),
            ingredients: recipe.ingredients
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((ingredient, index) => ({ ...ingredient, position: index })),
        })),
    };
}

/** "moscookbook-2026-09-20.json" */
export function archiveFilename(now = new Date()): string {
    return `moscookbook-${now.toISOString().slice(0, 10)}.json`;
}
