import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { sweepRateLimits } from '@/lib/rateLimitShared';
import { BACKUP_PREFIX } from '@/lib/backupPrefix.mjs';
import {
    buildArchive,
    archiveFilename,
    type ExportableRecipe,
    type ExportablePost,
    type ExportableCookPhoto,
    type ExportableCookLog,
} from '@/lib/archive';

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
    return req.headers.get('authorization') === `Bearer ${secret}`;
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
                    },
                },
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
                recipe: { select: { slug: true } },
                author: { select: { name: true } },
            },
        });

        const cookPhotos: ExportableCookPhoto[] = await prisma.cookPhoto.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
                url: true,
                caption: true,
                createdAt: true,
                recipe: { select: { slug: true } },
                user: { select: { name: true } },
            },
        });

        // Writing, and the only copy of it: "half the chilli next time" is a
        // line written once and missed by the person who wrote it.
        const cookLogs: ExportableCookLog[] = await prisma.cookLog.findMany({
            orderBy: { cookedAt: 'asc' },
            select: {
                cookedAt: true,
                note: true,
                recipe: { select: { slug: true } },
                user: { select: { name: true } },
            },
        });

        const archive = buildArchive(recipes, new Date(), posts, cookPhotos, cookLogs);

        // Housekeeping, attached to the one thing that already runs weekly.
        // Nothing depends on it — a closed rate-limit window is reused in
        // place — but without it the table grows a row per address that ever
        // signed in.
        const sweptLimits = await sweepRateLimits();
        if (sweptLimits > 0) console.log(`Swept ${sweptLimits} closed rate-limit windows.`);

        const blob = await put(
            `${PREFIX}${archiveFilename()}`,
            JSON.stringify(archive, null, 2),
            {
                access: 'public',
                contentType: 'application/json; charset=utf-8',
                // Two runs on one day overwrite rather than piling up
                // `-1`, `-2` files nobody asked for.
                addRandomSuffix: false,
                allowOverwrite: true,
            }
        );

        // Pruned after the new one is written, never before: a prune that ran
        // first and then failed to write would leave one fewer backup than
        // there was when it started.
        const existing = await list({ prefix: PREFIX, limit: 1000 });
        const old = existing.blobs
            .slice()
            .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
            .slice(KEEP);

        if (old.length > 0) {
            await del(old.map((entry) => entry.url)).catch((error) => {
                // A prune that fails costs a little storage. Saying the backup
                // failed because of it would be worse than wrong.
                console.error('Could not prune old backups:', error);
            });
        }

        return NextResponse.json({
            url: blob.url,
            recipes: recipes.length,
            posts: posts.length,
            cookPhotos: cookPhotos.length,
            pruned: old.length,
        });
    } catch (error) {
        console.error('Scheduled backup failed:', error);
        return NextResponse.json({ message: 'The backup did not run.' }, { status: 500 });
    }
}
