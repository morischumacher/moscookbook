import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { requireAdmin } from '@/lib/auth';
import { parseArchive, type ArchiveRecipe } from '@/lib/archive';
import { searchFields } from '@/lib/searchText';

const MAX_BODY_BYTES = 20 * 1024 * 1024;

/**
 * A restore writes a row per recipe, per entry and per photograph, and the
 * default ceiling on a serverless function is short enough that a real
 * cookbook can reach it. Sixty seconds is what every Vercel plan allows; a
 * timeout at least now leaves each recipe whole (see below) rather than one of
 * them deleted.
 */
export const maxDuration = 60;

/**
 * A date from an archive, or null.
 *
 * `new Date('nonsense')` is an Invalid Date, and Prisma throws on one. That
 * threw inside the loop, which aborted the restore — and by then a recipe had
 * already been deleted to make room for the one that could not be written.
 */
function safeDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function recipeData(recipe: ArchiveRecipe) {
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
        createdAt: safeDate(recipe.createdAt) ?? new Date(),
        ...searchFields({
            title: recipe.title,
            description: recipe.description,
            instructions: recipe.instructions,
            ingredients: recipe.ingredients.map((ingredient) => ingredient.name),
        }),
        images: { create: recipe.images.map((url, index) => ({ url, position: index })) },
        ingredients: {
            create: recipe.ingredients.map((ingredient, index) => ({
                position: index,
                quantity: ingredient.quantity,
                quantityMax: ingredient.quantityMax,
                unit: ingredient.unit,
                name: ingredient.name,
                raw: ingredient.raw,
            })),
        },
    };
}

/**
 * Restores an archive.
 *
 * Existing recipes are left alone unless `replace` is set: a restore that
 * silently overwrites the version you have been editing is not a restore, it
 * is a second disaster. Views, ratings and favourites are not imported —
 * they belong to this installation, not to the recipes.
 *
 * Two rules make this safe to run, and both were missing:
 *
 * **Each recipe is replaced inside a transaction.** It used to delete the old
 * row and then create the new one as two separate statements. If the create
 * failed — a date that parsed to Invalid Date, a connection drop, the function
 * timing out — the recipe was gone and nothing took its place. The restore had
 * destroyed data. Delete and create now succeed or fail together.
 *
 * **One bad recipe does not stop the rest.** A single throw used to abort the
 * loop into the catch below, leaving everything after it unprocessed and the
 * admin looking at "the archive could not be imported" with no idea how much
 * of it had gone in. Each row is attempted on its own and the failures are
 * counted and named in the response.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const length = Number(req.headers.get('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) {
        return NextResponse.json({ message: 'That archive is too large to import here.' }, { status: 413 });
    }

    let payload: unknown;
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({ message: 'That file is not valid JSON.' }, { status: 400 });
    }

    const body = payload as { archive?: unknown; replace?: unknown };
    const replace = body?.replace === true;
    const result = parseArchive(body?.archive ?? payload);

    if (!result.ok || !result.archive) {
        return NextResponse.json({ message: result.error ?? 'Not a valid archive' }, { status: 400 });
    }

    try {
        const existing: { slug: string }[] = await prisma.recipe.findMany({ select: { slug: true } });
        const existingSlugs = new Set(existing.map((recipe) => recipe.slug));

        let created = 0;
        let replaced = 0;
        let skipped = 0;
        const failed: { slug: string; reason: string }[] = [];

        for (const recipe of result.archive.recipes) {
            const exists = existingSlugs.has(recipe.slug);

            if (exists && !replace) {
                skipped += 1;
                continue;
            }

            try {
                await prisma.$transaction([
                    // deleteMany rather than delete: a row that is already gone
                    // is the outcome this wanted anyway, and `delete` would
                    // throw P2025 and take the whole transaction with it.
                    // Cascades carry the old images and ingredients away.
                    ...(exists
                        ? [prisma.recipe.deleteMany({ where: { slug: recipe.slug } })]
                        : []),
                    prisma.recipe.create({ data: recipeData(recipe) }),
                ]);

                if (exists) replaced += 1;
                else created += 1;
            } catch (error) {
                // Named, so the admin knows which recipe to look at rather than
                // being told a number.
                failed.push({
                    slug: recipe.slug,
                    reason: error instanceof Error ? error.message : 'unknown',
                });
                console.error(`Archive import: recipe ${recipe.slug} failed`, error);
            }
        }

        // Entries and photographs come after every recipe exists, because both
        // point at one by slug. A slug the archive does not carry — a note
        // about a recipe that was skipped, say — leaves the entry standing on
        // its own rather than dropping it: losing writing to a missing link
        // would be worse than an entry with nothing attached.
        const slugToId = new Map<string, number>(
            (
                await prisma.recipe.findMany({ select: { id: true, slug: true } })
            ).map((recipe: { id: number; slug: string }) => [recipe.slug, recipe.id])
        );

        let posts = 0;
        for (const post of result.archive.posts) {
            const taken = await prisma.post.findUnique({
                where: { slug: post.slug },
                select: { id: true },
            });

            // Same rule as a recipe: what is already here is not overwritten
            // unless that was asked for.
            if (taken && !replace) continue;

            // The search columns are left empty here on purpose. A restore
            // writes hundreds of rows, and recomputing the expansions row by
            // row would double its cost for a result `npm run reindex` produces
            // in one pass — which is the step the restore script already ends
            // with.
            try {
                // Same transaction rule as a recipe: the old entry only goes
                // away if the new one arrives.
                await prisma.$transaction([
                    ...(taken ? [prisma.post.deleteMany({ where: { slug: post.slug } })] : []),
                    prisma.post.create({
                        data: {
                            title: post.title,
                            slug: post.slug,
                            body: post.body,
                            imageUrl: post.imageUrl,
                            publishedAt: safeDate(post.publishedAt),
                            createdAt: safeDate(post.createdAt) ?? new Date(),
                            recipeId: post.recipeSlug ? slugToId.get(post.recipeSlug) ?? null : null,
                            // Authorship is by name in an archive and accounts
                            // are not in one, so a restored entry has no author
                            // rather than a wrong one.
                            authorId: null,
                        },
                    }),
                ]);
                posts += 1;
            } catch (error) {
                failed.push({
                    slug: post.slug,
                    reason: error instanceof Error ? error.message : 'unknown',
                });
                console.error(`Archive import: post ${post.slug} failed`, error);
            }
        }

        let photos = 0;
        for (const photo of result.archive.cookPhotos) {
            const recipeId = slugToId.get(photo.recipeSlug);
            // Unlike an entry, a photograph of a dish has nowhere to be shown
            // without one — the same reason its foreign key cascades.
            if (recipeId === undefined) continue;

            // The url is what makes a photograph unique here; importing the
            // same archive twice should not double every picture.
            const already = await prisma.cookPhoto.findFirst({
                where: { url: photo.url, recipeId },
                select: { id: true },
            });
            if (already) continue;

            try {
                await prisma.cookPhoto.create({
                    data: {
                        url: photo.url,
                        caption: photo.caption,
                        createdAt: safeDate(photo.createdAt) ?? new Date(),
                        recipeId,
                        userId: null,
                    },
                });
                photos += 1;
            } catch (error) {
                console.error(`Archive import: photo for ${photo.recipeSlug} failed`, error);
            }
        }

        // A restore can bring in a whole cookbook's worth of categories.
        forgetCollectionFacets();

        // Cooking logs last, for the same reason the photographs are: they
        // point at a recipe by slug, and the recipes have to exist first.
        // Authorship is dropped, like everywhere else here — accounts are not
        // in an archive, and a note attributed to the wrong person is worse
        // than one attributed to nobody. Which means a restored log needs
        // somebody to own it, and the admin doing the restoring is the only
        // account this code can be sure exists.
        let logs = 0;
        for (const entry of result.archive.cookLogs) {
            const recipeId = slugToId.get(entry.recipeSlug);
            if (recipeId === undefined) continue;

            const cookedAt = safeDate(entry.cookedAt) ?? new Date();

            try {
                // The date and the recipe are what make an entry unique, so
                // restoring the same archive twice does not double the log.
                const already = await prisma.cookLog.findFirst({
                    where: { recipeId, cookedAt, userId: auth.user.id },
                    select: { id: true },
                });
                if (already) continue;

                await prisma.cookLog.create({
                    data: { recipeId, userId: auth.user.id, cookedAt, note: entry.note },
                });
                logs += 1;
            } catch (error) {
                console.error(`Archive import: cook log for ${entry.recipeSlug} failed`, error);
            }
        }

        // Collections last: they point at recipes by slug, so the recipes
        // have to exist. A collection whose recipes are not all in the archive
        // is restored with the ones that are rather than skipped — half a menu
        // is more use than none, and the missing ones are missing either way.
        let collections = 0;
        for (const collection of result.archive.collections) {
            const recipeIds = collection.recipeSlugs
                .map((slug) => slugToId.get(slug))
                .filter((id): id is number => id !== undefined);

            try {
                const taken = await prisma.collection.findUnique({
                    where: { slug: collection.slug },
                    select: { id: true },
                });

                if (taken && !replace) continue;

                await prisma.$transaction([
                    ...(taken
                        ? [prisma.collection.deleteMany({ where: { slug: collection.slug } })]
                        : []),
                    prisma.collection.create({
                        data: {
                            title: collection.title,
                            slug: collection.slug,
                            description: collection.description,
                            createdAt: safeDate(collection.createdAt) ?? new Date(),
                            recipes: {
                                create: recipeIds.map((recipeId, index) => ({
                                    recipeId,
                                    position: index,
                                })),
                            },
                        },
                    }),
                ]);

                collections += 1;
            } catch (error) {
                failed.push({
                    slug: collection.slug,
                    reason: error instanceof Error ? error.message : 'unknown',
                });
                console.error(`Archive import: collection ${collection.slug} failed`, error);
            }
        }

        return NextResponse.json({
            created,
            replaced,
            skipped,
            total: result.archive.recipes.length,
            posts,
            photos,
            logs,
            collections,
            // Reported rather than thrown: the rest of the archive is in, and
            // the admin needs to know exactly what is not.
            failed,
        });
    } catch (error) {
        console.error('Archive import error:', error);
        return NextResponse.json({ message: 'The archive could not be imported.' }, { status: 500 });
    }
}
