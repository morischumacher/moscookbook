import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { put, list, del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { sweepRateLimits } from '@/lib/rateLimitShared';
import { syncAll } from '@/lib/workItemsDb';
import { BACKUP_PREFIX } from '@/lib/backupPrefix.mjs';
import {
    buildArchive,
    archiveFilename,
    isGuessableBackup,
    type ExportableRecipe,
    type ExportablePost,
    type ExportableCookEntry,
    type ExportableCollection,
    type ExportableMenu,
    menuArchiveSelect,
    translationArchiveSelect,
} from '@/lib/archive';
import { failed } from '@/lib/reportServerError';
import { recordBackupRun } from '@/lib/backupStatus';

/**
 * A backup nobody has to remember.
 *
 * Vercel calls this on a schedule (see vercel.json) and it writes the archive
 * into the Blob store next to the pictures. It is deliberately the *small*
 * backup: the JSON, not the image files. Those are already in the same store,
 * and copying them weekly would multiply the bill to protect against nothing —
 * a store that loses the pictures loses the copies with them.
 *
 * `npm run backup` on a laptop is still the one that matters, because it takes
 * the files somewhere else entirely. This is the one that happens whether or
 * not anybody thinks of it, and a backup you have to remember is a backup that
 * eventually is not taken.
 *
 * Only the newest few are kept. A weekly file for ever is a slowly growing bill
 * for copies of a cookbook as it was in 2029.
 */

const KEEP = 8;

// Imported rather than written out again: the sweep script needs the same
// string, and when the two disagreed the sweep deleted every backup.
const PREFIX = BACKUP_PREFIX;

/**
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when the secret is set.
 * Without one this endpoint would be a way for anyone to make the database do
 * work, so a missing secret means the route refuses rather than opens.
 */
function authorised(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    /*
     * Constant-time, because this header guards a route that deletes blobs.
     * `===` on strings returns at the first byte that differs, which leaks how
     * much of a guess was right. The length check first is not a leak in the
     * other direction — the secret's length is not the secret — and
     * timingSafeEqual requires equal lengths.
     */
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(req.headers.get('authorization') ?? '');
    return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
    if (!authorised(req)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const recipes: ExportableRecipe[] = await prisma.recipe.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
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
        });

        const posts: ExportablePost[] = await prisma.post.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
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
        });

        // Writing, and the only copy of it: "half the chilli next time" is a
        // line written once and missed by the person who wrote it. The
        // pictures come with it now, in the order they were arranged.
        const cookEntries: ExportableCookEntry[] = await prisma.cookEntry.findMany({
            orderBy: { cookedAt: 'asc' },
            select: {
                cookedAt: true,
                note: true,
                recipe: { select: { slug: true } },
                user: { select: { name: true } },
                photos: { orderBy: { position: 'asc' }, select: { url: true } },
            },
        });

        const collections: ExportableCollection[] = await prisma.collection.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
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
        });

        const menus: ExportableMenu[] = await prisma.menu.findMany({
            orderBy: { createdAt: 'asc' },
            select: menuArchiveSelect,
        });

        const archive = buildArchive(
            recipes,
            new Date(),
            posts,
            cookEntries,
            collections,
            menus
        );

        // Housekeeping, attached to the one thing that already runs weekly.
        // Nothing depends on it — a closed rate-limit window is reused in
        // place — but without it the table grows a row per address that ever
        // signed in.
        const sweptLimits = await sweepRateLimits();
        if (sweptLimits > 0) console.log(`Swept ${sweptLimits} closed rate-limit windows.`);

        await put(
            `${PREFIX}${archiveFilename()}`,
            JSON.stringify(archive, null, 2),
            {
                access: 'public',
                contentType: 'application/json; charset=utf-8',
                // The store is public and its hostname is in every image URL,
                // so the name is what keeps this file private: the random
                // suffix makes it unguessable, and listing the store needs the
                // token. Without it, anybody could fetch last Monday's backup
                // by typing the date.
                addRandomSuffix: true,
            }
        );

        // And the work list, caught up with whatever happened this week —
        // after the backup is written, so a slow catch-up cannot keep it
        // from being written at all.
        await syncAll().catch((error) => console.error('Work list catch-up failed:', error));

        // Pruned after the new one is written, never before: a prune that ran
        // first and then failed to write would leave one fewer backup than
        // there was when it started. Backups from before the random suffix are
        // removed whatever their age — they are the ones anybody could fetch.
        const existing = await list({ prefix: PREFIX, limit: 1000 });
        const newestFirst = existing.blobs
            .slice()
            .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        const guessable = newestFirst.filter((entry) => isGuessableBackup(entry.pathname, PREFIX));
        const old = [
            ...guessable,
            ...newestFirst
                .filter((entry) => !isGuessableBackup(entry.pathname, PREFIX))
                .slice(KEEP),
        ];

        if (old.length > 0) {
            await del(old.map((entry) => entry.url)).catch((error) => {
                // A prune that fails costs a little storage. Saying the backup
                // failed because of it would be worse than wrong.
                failed('Could not prune old backups:', error);
            });
        }

        await recordBackupRun(
            `${recipes.length} recipes, ${posts.length} posts, ${cookEntries.length} cook entries`,
            true
        );

        return NextResponse.json({
            // No URL: the name is the only secret the file has, and this
            // response ends up in the cron logs.
            written: true,
            recipes: recipes.length,
            posts: posts.length,
            cookEntries: cookEntries.length,
            cookPhotos: cookEntries.reduce((total, entry) => total + entry.photos.length, 0),
            pruned: old.length,
        });
    } catch (error) {
        failed('Scheduled backup failed:', error);
        await recordBackupRun(error instanceof Error ? error.message.slice(0, 200) : 'unknown', false);
        return NextResponse.json({ message: 'The backup did not run.' }, { status: 500 });
    }
}
