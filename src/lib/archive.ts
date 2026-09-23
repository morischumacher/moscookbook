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

/**
 * 5: one cooking entry with its photographs, where 2-4 had a list of
 * photographs and a separate list of cookings; and whether a recipe is
 * published. 4 added collections, 3 cooking logs, 2 entries and photographs.
 *
 * A reader of an older archive still works — every new array defaults to empty,
 * every new field to the safe value — and an archive from a newer version is
 * refused with the numbers in the message rather than half-read.
 */
export const ARCHIVE_VERSION = 5;

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
    /**
     * Whether the recipe was published on its own address.
     *
     * In the archive because losing it is a silent change of meaning: a
     * restore without it turns every published recipe private, and nobody
     * would notice until they wondered why a link they had given somebody
     * stopped working. Defaults to false, so an archive written before this
     * existed restores the safe way round rather than failing.
     */
    isPublic: z.boolean().default(false),
    /*
     * Defaults to false, which is what every archive written before drafts
     * existed means: everything in it was already a recipe. A draft that is
     * restored as a recipe would be the backup quietly finishing work nobody
     * did.
     */
    isDraft: z.boolean().default(false),
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

/**
 * One cooking: who, when, what they would change, and what it looked like.
 *
 * In the archive because it is the only writing on the site nobody can
 * reconstruct. "Half the chilli next time" is written once, by the person who
 * would miss it, and the date is the other half of it.
 *
 * By slug and by name, like everything else here: an archive is restored into
 * a database where every id is new, and accounts are not in an archive.
 */
const archiveCookEntrySchema = z.object({
    recipeSlug: z.string().min(1),
    cookedAt: z.string().default(() => new Date().toISOString()),
    note: z.string().nullable().default(null),
    author: z.string().nullable().default(null),
    /** Picture URLs, in the order they were arranged. */
    photos: z.array(z.string().min(1)).default([]),
});

/*
 * Versions 2 to 4 wrote two arrays where there is now one: a photograph with a
 * caption, and a cooking with a note. They are still read — an archive written
 * last month has to restore into a build from today, or the backup was
 * decorative — and `cookEntriesFrom` folds them into entries with the same
 * rule the database migration used.
 *
 * Nothing writes them any more. They are inputs, not outputs.
 */

const legacyCookPhotoSchema = z.object({
    url: z.string().min(1),
    caption: z.string().nullable().default(null),
    createdAt: z.string().default(() => new Date().toISOString()),
    recipeSlug: z.string().min(1),
    author: z.string().nullable().default(null),
});

const legacyCookLogSchema = z.object({
    recipeSlug: z.string().min(1),
    cookedAt: z.string().default(() => new Date().toISOString()),
    note: z.string().nullable().default(null),
    author: z.string().nullable().default(null),
});

/**
 * A collection: a name, and the recipes it holds in order.
 *
 * In the archive because arranging is work. Nobody remembers the order of a
 * Christmas menu they put together two years ago, and a restore that brought
 * back every recipe and none of the arranging would have quietly thrown away
 * the part that took the thinking.
 *
 * The recipes by slug, in order, like everything else here.
 */
const archiveCollectionSchema = z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().nullable().default(null),
    createdAt: z.string().default(() => new Date().toISOString()),
    recipeSlugs: z.array(z.string()).default([]),
});

export const archiveSchema = z.object({
    version: z.number().int(),
    exportedAt: z.string(),
    recipeCount: z.number().int().min(0).optional(),
    recipes: z.array(archiveRecipeSchema),
    posts: z.array(archivePostSchema).default([]),
    cookEntries: z.array(archiveCookEntrySchema).default([]),
    /** Read for versions 2-4, never written. See above. */
    cookPhotos: z.array(legacyCookPhotoSchema).default([]),
    cookLogs: z.array(legacyCookLogSchema).default([]),
    collections: z.array(archiveCollectionSchema).default([]),
});

export type ArchiveRecipe = z.infer<typeof archiveRecipeSchema>;
export type ArchivePost = z.infer<typeof archivePostSchema>;
export type ArchiveCookEntry = z.infer<typeof archiveCookEntrySchema>;
export type ArchiveCollection = z.infer<typeof archiveCollectionSchema>;
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
    isPublic: boolean;
    isDraft: boolean;
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

export interface ExportableCookEntry {
    cookedAt: Date;
    note: string | null;
    recipe: { slug: string };
    user: { name: string } | null;
    photos: { url: string }[];
}

export interface ExportableCollection {
    title: string;
    slug: string;
    description: string | null;
    createdAt: Date;
    recipes: { recipe: { slug: string } }[];
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
        isPublic: recipe.isPublic,
        isDraft: recipe.isDraft,
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

export function toArchiveCookEntry(entry: ExportableCookEntry): ArchiveCookEntry {
    return {
        recipeSlug: entry.recipe.slug,
        cookedAt: entry.cookedAt.toISOString(),
        note: entry.note,
        author: entry.user?.name ?? null,
        photos: entry.photos.map((photo) => photo.url),
    };
}

/**
 * Every cooking in an archive, whatever version wrote it.
 *
 * A version-5 archive already has them. Versions 2 to 4 have a list of
 * photographs and a list of cookings instead, and this folds those together
 * using the rule the database migration used: **one entry per recipe, per
 * person, per day.** Captions and notes meeting in the same entry are joined
 * with " · " in the order they were written rather than one winning.
 *
 * Restoring an old archive therefore produces the same rows as migrating the
 * database it came from, which is the only property that makes an old backup
 * worth keeping.
 */
export function cookEntriesFrom(archive: Archive): ArchiveCookEntry[] {
    if (archive.cookEntries.length > 0) return archive.cookEntries;

    /** recipe, author and day — the same key the SQL migration grouped on. */
    const keyOf = (recipeSlug: string, author: string | null, at: string) =>
        `${recipeSlug}\u0000${author ?? ''}\u0000${at.slice(0, 10)}`;

    const merged = new Map<string, ArchiveCookEntry & { texts: string[] }>();

    const add = (
        recipeSlug: string,
        author: string | null,
        at: string,
        text: string | null,
        url: string | null
    ) => {
        const key = keyOf(recipeSlug, author, at);
        let entry = merged.get(key);

        if (!entry) {
            entry = { recipeSlug, cookedAt: at, note: null, author, photos: [], texts: [] };
            merged.set(key, entry);
        }

        // The earliest moment of the day stands for the evening, as MIN(ts) did.
        if (at < entry.cookedAt) entry.cookedAt = at;

        const trimmed = (text ?? '').trim();
        if (trimmed !== '' && !entry.texts.includes(trimmed)) entry.texts.push(trimmed);

        if (url) entry.photos.push(url);
    };

    // Photographs first, then cookings, and both in the order they appear —
    // which for an export ordered by id is the order they were written.
    for (const photo of archive.cookPhotos) {
        add(photo.recipeSlug, photo.author, photo.createdAt, photo.caption, photo.url);
    }

    for (const log of archive.cookLogs) {
        add(log.recipeSlug, log.author, log.cookedAt, log.note, null);
    }

    return [...merged.values()].map(({ texts, ...entry }) => ({
        ...entry,
        note: texts.length > 0 ? texts.join(' · ') : null,
    }));
}

export function toArchiveCollection(
    collection: ExportableCollection
): Archive['collections'][number] {
    return {
        title: collection.title,
        slug: collection.slug,
        description: collection.description,
        createdAt: collection.createdAt.toISOString(),
        // Already ordered by the query; the array's own order is the order.
        recipeSlugs: collection.recipes.map((row) => row.recipe.slug),
    };
}

export function buildArchive(
    recipes: ExportableRecipe[],
    now = new Date(),
    posts: ExportablePost[] = [],
    cookEntries: ExportableCookEntry[] = [],
    collections: ExportableCollection[] = []
): Archive {
    return {
        version: ARCHIVE_VERSION,
        exportedAt: now.toISOString(),
        recipeCount: recipes.length,
        recipes: recipes.map(toArchiveRecipe),
        posts: posts.map(toArchivePost),
        cookEntries: cookEntries.map(toArchiveCookEntry),
        // Written empty, read when an older archive has them. A reader that
        // drops the field entirely would make a version-5 archive fail to
        // parse against a version-4 build, and an archive that only its own
        // build can read is not a backup.
        cookPhotos: [],
        cookLogs: [],
        collections: collections.map(toArchiveCollection),
    };
}

/** "moscookbook-2026-09-20.json" */
export function archiveFilename(now = new Date()): string {
    return `moscookbook-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * A backup stored under the plain dated name, with nothing unguessable in it.
 *
 * The Blob store is public — it has to be, it serves every picture on the site
 * — and its hostname is in every image URL. A backup written as
 * `backups/moscookbook-2026-09-21.json` could therefore be fetched by anyone
 * who tried last Monday's date, and it holds every private recipe, draft, note
 * and name in the cookbook. Backups are now written with the store's random
 * suffix; these are the old ones, which the next run deletes.
 */
export function isGuessableBackup(pathname: string, prefix: string): boolean {
    if (!pathname.startsWith(prefix)) return false;
    return /^moscookbook-\d{4}-\d{2}-\d{2}\.json$/.test(pathname.slice(prefix.length));
}
