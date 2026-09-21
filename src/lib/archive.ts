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

export const ARCHIVE_VERSION = 2;

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

/**
 * A written entry, and the pictures people took of what they cooked.
 *
 * Added in version 2, and defaulted to empty so that a version 1 archive —
 * every backup taken before this — still reads. A restore that refused last
 * month's file because this month's format grew would be the exact failure a
 * backup exists to prevent.
 *
 * A post's recipe is carried as that recipe's slug rather than as an id:
 * an archive is restored into a database where ids are new, and a slug is the
 * one name that survives the trip.
 */
const archivePostSchema = z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    body: z.string().default(''),
    imageUrl: z.string().nullable().default(null),
    publishedAt: z.string().nullable().default(null),
    createdAt: z.string().default(() => new Date().toISOString()),
    /** The recipe it belongs to, by slug. Null for a standalone entry. */
    recipeSlug: z.string().nullable().default(null),
    /** Who wrote it, by name. Accounts are not in an archive. */
    author: z.string().nullable().default(null),
});

const archiveCookPhotoSchema = z.object({
    url: z.string().min(1),
    caption: z.string().nullable().default(null),
    createdAt: z.string().default(() => new Date().toISOString()),
    recipeSlug: z.string().min(1),
    author: z.string().nullable().default(null),
});

export const archiveSchema = z.object({
    version: z.number().int(),
    exportedAt: z.string(),
    recipeCount: z.number().int().min(0).optional(),
    recipes: z.array(archiveRecipeSchema),
    posts: z.array(archivePostSchema).default([]),
    cookPhotos: z.array(archiveCookPhotoSchema).default([]),
});

export type ArchiveRecipe = z.infer<typeof archiveRecipeSchema>;
export type ArchivePost = z.infer<typeof archivePostSchema>;
export type ArchiveCookPhoto = z.infer<typeof archiveCookPhotoSchema>;
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

export interface ExportablePost {
    title: string;
    slug: string;
    body: string;
    imageUrl: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    recipe: { slug: string } | null;
    author: { name: string } | null;
}

export interface ExportableCookPhoto {
    url: string;
    caption: string | null;
    createdAt: Date;
    recipe: { slug: string };
    user: { name: string } | null;
}

/*
 * One row, converted.
 *
 * Pulled out of buildArchive so that the streaming export can emit rows one
 * page at a time without a second copy of the mapping. Two copies of "what an
 * archived recipe looks like" is precisely how an archive comes to disagree
 * with the thing that restores it.
 */

export function toArchiveRecipe(recipe: ExportableRecipe): ArchiveRecipe {
    return {
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
    };
}

export function toArchivePost(post: ExportablePost): Archive['posts'][number] {
    return {
        title: post.title,
        slug: post.slug,
        body: post.body,
        imageUrl: post.imageUrl,
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        createdAt: post.createdAt.toISOString(),
        // By slug rather than by id: an archive is restored into a database
        // where every id is new, and a slug is the one name that survives the
        // trip. The author is a name for the same reason — accounts are not in
        // an archive.
        recipeSlug: post.recipe?.slug ?? null,
        author: post.author?.name ?? null,
    };
}

export function toArchiveCookPhoto(photo: ExportableCookPhoto): Archive['cookPhotos'][number] {
    return {
        url: photo.url,
        caption: photo.caption,
        createdAt: photo.createdAt.toISOString(),
        recipeSlug: photo.recipe.slug,
        author: photo.user?.name ?? null,
    };
}

export function buildArchive(
    recipes: ExportableRecipe[],
    now = new Date(),
    posts: ExportablePost[] = [],
    cookPhotos: ExportableCookPhoto[] = []
): Archive {
    return {
        version: ARCHIVE_VERSION,
        exportedAt: now.toISOString(),
        recipeCount: recipes.length,
        recipes: recipes.map(toArchiveRecipe),
        posts: posts.map(toArchivePost),
        cookPhotos: cookPhotos.map(toArchiveCookPhoto),
    };
}

/** "moscookbook-2026-09-20.json" */
export function archiveFilename(now = new Date()): string {
    return `moscookbook-${now.toISOString().slice(0, 10)}.json`;
}
