import prisma from './prisma';

/**
 * Reading one collection, in one place.
 *
 * Three pages want the same rows — the private page, the shared page and its
 * metadata — and the ordering is the part that must not drift: a collection
 * whose recipes come back in a different order on the shared page is a
 * different collection.
 */

export interface CollectionRow {
    id: number;
    title: string;
    slug: string;
    description: string | null;
    shareToken: string | null;
    recipes: { id: number; title: string; slug: string; imageUrl: string | null }[];
}

interface JoinRow {
    position: number;
    recipe: { id: number; title: string; slug: string; images: { url: string }[] };
}

interface RawCollection {
    id: number;
    title: string;
    slug: string;
    description: string | null;
    shareToken: string | null;
    recipes: JoinRow[];
}

/** What every caller selects, so none of them can select something else. */
const include = {
    recipes: {
        orderBy: { position: 'asc' as const },
        /*
         * A collection can be shared at /c/<token>, which needs no account, so
         * a draft sitting in one is a draft a stranger can read. Filtering the
         * join rather than the recipe: the row stays, its recipe comes back
         * null, and `flatten` drops it — which is also what should happen on
         * the member's own page, since a collection of things to cook should
         * not list one that is not ready.
         */
        where: { recipe: { isDraft: false } },
        select: {
            position: true,
            recipe: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    // One picture, the first — a tile shows one.
                    images: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
                },
            },
        },
    },
};

function flatten(collection: RawCollection): CollectionRow {
    return {
        id: collection.id,
        title: collection.title,
        slug: collection.slug,
        description: collection.description,
        shareToken: collection.shareToken,
        recipes: collection.recipes.map((row) => ({
            id: row.recipe.id,
            title: row.recipe.title,
            slug: row.recipe.slug,
            imageUrl: row.recipe.images[0]?.url ?? null,
        })),
    };
}

export async function collectionBySlug(slug: string): Promise<CollectionRow | null> {
    const found: RawCollection | null = await prisma.collection.findUnique({
        where: { slug },
        select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            shareToken: true,
            ...include,
        },
    });

    return found ? flatten(found) : null;
}

export async function collectionByToken(token: string): Promise<CollectionRow | null> {
    // A token that is not the shape a token has is refused before the database
    // is asked, the same way the recipe and post share routes do it.
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;

    const found: RawCollection | null = await prisma.collection.findUnique({
        where: { shareToken: token },
        select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            shareToken: true,
            ...include,
        },
    });

    return found ? flatten(found) : null;
}
