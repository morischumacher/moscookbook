import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import {
    ARCHIVE_VERSION,
    translationArchiveSelect,
    archiveFilename,
    toArchiveRecipe,
    toArchivePost,
    toArchiveCookEntry,
    toArchiveCollection,
    toArchiveMenu,
    menuArchiveSelect,
    type ExportableRecipe,
    type ExportablePost,
    type ExportableCookEntry,
    type ExportableCollection,
    type ExportableMenu,
} from '@/lib/archive';
import { failed } from '@/lib/reportServerError';

/**
 * Downloads the whole cookbook as one JSON file.
 *
 * Images are referenced by URL rather than embedded: a serverless response is
 * the wrong place to assemble tens of megabytes. `npm run backup` fetches the
 * files as well and is the one to run for a real offline copy.
 *
 * **Written out as it is read.** This used to load every recipe, every
 * ingredient, every entry's full Markdown body and every cooked photograph into
 * one array, hand the lot to `JSON.stringify(…, null, 2)`, and send the string
 * — so the peak memory of a backup was the whole database twice over, once as
 * objects and once as text, inside a function with a fixed memory limit. It
 * works today at a hundred recipes. It stops working at some number nobody can
 * predict, and the way it stops is the backup failing, which is the one thing a
 * backup may not do.
 *
 * So the rows are read a page at a time and each one is written to the response
 * as it arrives. Nothing is held but the page being converted, and the shape
 * produced is byte-for-byte the shape `buildArchive` produces — the per-row
 * conversion is the same function, which is the point of it being a function.
 */

/** Rows per query. Large enough to be few round trips, small enough to hold. */
const PAGE = 200;

const encoder = new TextEncoder();

export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    // Before the stream opens, so that a failure here is still an error
    // response rather than a truncated file that looks like an archive.
    let recipeCount: number;

    try {
        recipeCount = await prisma.recipe.count();
    } catch (error) {
        failed('Export error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const write = (text: string) => controller.enqueue(encoder.encode(text));

            /**
             * Reads one table in pages, writing each row as it goes.
             *
             * Paged by id rather than by `skip`: `skip` makes the database
             * count past the rows it is skipping, so the last page of a long
             * export costs the most. A cursor costs the same every time.
             */
            const writeAll = async <Row extends { id: number }, Out>(
                page: (afterId: number) => Promise<Row[]>,
                convert: (row: Row) => Out
            ) => {
                let afterId = 0;
                let first = true;

                for (;;) {
                    const rows = await page(afterId);
                    if (rows.length === 0) break;

                    for (const row of rows) {
                        write((first ? '\n    ' : ',\n    ') + JSON.stringify(convert(row)));
                        first = false;
                    }

                    afterId = rows[rows.length - 1].id;
                    if (rows.length < PAGE) break;
                }

                // A closing bracket on its own line when anything was written,
                // so the file reads the way the old one did.
                write(first ? '' : '\n  ');
            };

            try {
                write(
                    '{\n' +
                    `  "version": ${ARCHIVE_VERSION},\n` +
                    `  "exportedAt": ${JSON.stringify(new Date().toISOString())},\n` +
                    `  "recipeCount": ${recipeCount},\n` +
                    '  "recipes": ['
                );

                await writeAll<ExportableRecipe & { id: number }, unknown>(
                    (afterId) =>
                        prisma.recipe.findMany({
                            where: { id: { gt: afterId } },
                            orderBy: { id: 'asc' },
                            take: PAGE,
                            select: {
                                id: true,
                                title: true,
                                slug: true,
                                description: true,
                                instructions: true,
                                category: true,
                                nationality: true,
                                servings: true,
                                prepMinutes: true,
                                cookMinutes: true,
                                views: true,
                                isPublic: true,
                                isDraft: true,
                tags: true,
                categories: true,
                cuisines: true,
                spiciness: true,
                                createdAt: true,
                                images: { orderBy: { position: 'asc' }, select: { url: true } },
                                ingredients: {
                                    orderBy: { position: 'asc' },
                                    select: {
                                        position: true,
                                        quantity: true,
                                        quantityMax: true,
                                        unit: true,
                                        name: true,
                                        raw: true,
                                        section: true,
                                    },
                                },
                                language: true,
                                translations: translationArchiveSelect,
                            },
                        }),
                    toArchiveRecipe
                );

                // Everything a person wrote or photographed, not only the
                // recipes. A backup that quietly stops covering what was added
                // last month is the one failure a backup exists to prevent, and
                // scripts/check-backup.mjs refuses to let a new table slip past.
                write('],\n  "posts": [');

                await writeAll<ExportablePost & { id: number }, unknown>(
                    (afterId) =>
                        prisma.post.findMany({
                            where: { id: { gt: afterId } },
                            orderBy: { id: 'asc' },
                            take: PAGE,
                            select: {
                                id: true,
                                title: true,
                                slug: true,
                                body: true,
                                imageUrl: true,
                                publishedAt: true,
                                createdAt: true,
                                recipes: { orderBy: { position: 'asc' }, select: { recipe: { select: { slug: true } } } },
                                collections: { orderBy: { position: 'asc' }, select: { collection: { select: { slug: true } } } },
                                author: { select: { name: true } },
                            },
                        }),
                    toArchivePost
                );

                write('],\n  "cookEntries": [');

                await writeAll<ExportableCookEntry & { id: number }, unknown>(
                    (afterId) =>
                        prisma.cookEntry.findMany({
                            where: { id: { gt: afterId } },
                            orderBy: { id: 'asc' },
                            take: PAGE,
                            select: {
                                id: true,
                                cookedAt: true,
                                note: true,
                                recipe: { select: { slug: true } },
                                user: { select: { name: true } },
                                photos: {
                                    orderBy: { position: 'asc' },
                                    select: { url: true },
                                },
                            },
                        }),
                    toArchiveCookEntry
                );

                write('],\n  "collections": [');

                await writeAll<ExportableCollection & { id: number }, unknown>(
                    (afterId) =>
                        prisma.collection.findMany({
                            where: { id: { gt: afterId } },
                            orderBy: { id: 'asc' },
                            take: PAGE,
                            select: {
                                id: true,
                                title: true,
                                slug: true,
                                description: true,
                                imageUrl: true,
                                createdAt: true,
                                recipes: {
                                    orderBy: { position: 'asc' },
                                    select: { recipe: { select: { slug: true } } },
                                },
                            },
                        }),
                    toArchiveCollection
                );

                write('],\n  "menus": [');

                await writeAll<ExportableMenu & { id: number }, unknown>(
                    (afterId) =>
                        prisma.menu.findMany({
                            where: { id: { gt: afterId } },
                            orderBy: { id: 'asc' },
                            take: PAGE,
                            select: { id: true, ...menuArchiveSelect },
                        }),
                    toArchiveMenu
                );

                write(']\n}\n');
                controller.close();
            } catch (error) {
                // The headers are long gone by now, so this cannot become a
                // 500. Breaking the stream is what makes the browser report a
                // failed download rather than saving an archive that stops in
                // the middle of a recipe and parses as nothing.
                failed('Export failed mid-stream:', error);
                controller.error(error);
            }
        },
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="${archiveFilename()}"`,
            'Cache-Control': 'no-store',
        },
    });
}
