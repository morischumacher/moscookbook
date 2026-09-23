#!/usr/bin/env node
/**
 * Finds files in the Blob store that nothing points at any more.
 *
 *   npm run sweep            -> lists them, deletes nothing
 *   npm run sweep -- --delete
 *
 * Deleting a recipe used to leave its pictures behind for ever: nothing broke,
 * the files simply became unreachable and kept being paid for. The application
 * takes them with the row now, so this is for what leaked before that, and for
 * whatever a failed delete leaves behind later.
 *
 * Two safeguards, and both matter more than the saving:
 *
 * **It lists first.** Nothing is deleted unless `--delete` is passed, because
 * the failure mode here is deleting a photograph somebody took.
 *
 * **It never touches the backups.** They live under a prefix of their own and
 * no row in the database points at them, which is exactly the shape this
 * script looks for — so without the rule below, one `--delete` would have
 * taken every automated backup with it. The safety net was on the list of
 * things to sweep away.
 *
 * **It ignores anything recent.** The admin form uploads a picture and saves
 * the recipe a minute later; in between, the file is real and nothing points at
 * it yet. A file has to be older than the grace period before it counts as
 * abandoned, or this script races the person using the site.
 */
import { list, del } from '@vercel/blob';
import { PrismaClient } from '@prisma/client';
import { BACKUP_PREFIX } from '../src/lib/backupPrefix.mjs';
import 'dotenv/config';

const prisma = new PrismaClient();

const DELETE = process.argv.includes('--delete');

/** Long enough to cover somebody filling in a recipe form slowly. */
const GRACE_HOURS = 24;

/**
 * Our own pictures written into a text as Markdown, `![…](https://…)`.
 * Matched on the store's address rather than on the Markdown, so a picture
 * pasted as a bare link or inside HTML counts too — a false keep costs a few
 * kilobytes, a false delete costs a picture.
 */
function picturesIn(text) {
    return [...text.matchAll(/https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s)"'<>]+/gi)].map(
        (match) => match[0]
    );
}

async function referencedUrls() {
    const [images, posts, cookedPhotos, captures, avatars, collections, recipeTexts, reportPhotos] = await Promise.all([
        prisma.image.findMany({ select: { url: true } }),
        // The body too: a picture placed inside an entry's text is pointed at
        // by nothing but the text, and without this it would be deleted a
        // week after it was written.
        prisma.post.findMany({ select: { imageUrl: true, body: true } }),
        prisma.cookEntryPhoto.findMany({ select: { url: true } }),
        // The inbox counts: a capture holds a screenshot that has not become a
        // recipe yet, and sweeping those away would empty the inbox of its
        // pictures.
        prisma.capture.findMany({ select: { imageUrl: true, moreImageUrls: true } }),
        // Profile pictures. A column this script does not know about is a
        // column whose files are deleted on the next run — silently, and a
        // week later, which is the worst possible shape for that bug.
        prisma.user.findMany({ select: { avatarUrl: true } }),
        // A collection's own picture, and any written into its description.
        prisma.collection.findMany({ select: { imageUrl: true, description: true } }),
        // A recipe's method is Markdown as well, and may hold a picture.
        prisma.recipe.findMany({ select: { instructions: true } }),
        // Screenshots sent with a ticket or attached to an error.
        prisma.reportPhoto.findMany({ select: { url: true } }),
    ]);

    const urls = new Set();
    for (const row of images) if (row.url) urls.add(row.url);
    for (const row of posts) if (row.imageUrl) urls.add(row.imageUrl);
    for (const row of cookedPhotos) if (row.url) urls.add(row.url);
    for (const row of captures) {
        if (row.imageUrl) urls.add(row.imageUrl);
        for (const url of row.moreImageUrls ?? []) urls.add(url);
    }
    for (const row of avatars) if (row.avatarUrl) urls.add(row.avatarUrl);
    for (const row of collections) if (row.imageUrl) urls.add(row.imageUrl);
    for (const row of reportPhotos) if (row.url) urls.add(row.url);

    for (const text of [
        ...posts.map((row) => row.body),
        ...collections.map((row) => row.description ?? ''),
        ...recipeTexts.map((row) => row.instructions),
    ]) {
        for (const url of picturesIn(text)) urls.add(url);
    }

    // A draft in the inbox holds the picture inside its JSON rather than in a
    // column of its own, so that is read too. Cheap, and the alternative is
    // deleting the illustration of a capture somebody has not got round to.
    const drafts = await prisma.capture.findMany({ select: { draft: true } });
    for (const row of drafts) {
        const url = row.draft && typeof row.draft === 'object' ? row.draft.imageUrl : null;
        if (typeof url === 'string' && url) urls.add(url);
    }

    return urls;
}

async function main() {
    const referenced = await referencedUrls();
    const cutoff = Date.now() - GRACE_HOURS * 60 * 60 * 1000;

    const orphans = [];
    let total = 0;
    let recent = 0;
    let kept = 0;
    let bytes = 0;

    let cursor;
    do {
        const page = await list({ cursor, limit: 1000 });
        cursor = page.hasMore ? page.cursor : undefined;

        for (const blob of page.blobs) {
            total += 1;

            // Nothing in the database points at a backup, and nothing ever
            // will. Matched on the pathname rather than on the URL, because the
            // store's own listing is the only thing that knows where a file
            // sits.
            if (blob.pathname.startsWith(BACKUP_PREFIX)) {
                kept += 1;
                continue;
            }

            if (referenced.has(blob.url)) continue;

            if (new Date(blob.uploadedAt).getTime() > cutoff) {
                recent += 1;
                continue;
            }

            orphans.push(blob);
            bytes += blob.size ?? 0;
        }
    } while (cursor);

    const mb = (bytes / (1024 * 1024)).toFixed(1);

    console.log(`${total} files in the store, ${referenced.size} referenced.`);
    if (kept > 0) console.log(`${kept} backup(s) under ${BACKUP_PREFIX} — never swept.`);
    if (recent > 0) {
        console.log(`${recent} unreferenced but newer than ${GRACE_HOURS}h — left alone.`);
    }

    if (orphans.length === 0) {
        console.log('Nothing to sweep.');
        return;
    }

    console.log(`\n${orphans.length} orphaned file(s), ${mb} MB:\n`);
    for (const blob of orphans.slice(0, 40)) {
        console.log(`  ${new Date(blob.uploadedAt).toISOString().slice(0, 10)}  ${blob.pathname}`);
    }
    if (orphans.length > 40) console.log(`  … and ${orphans.length - 40} more`);

    if (!DELETE) {
        console.log('\nNothing was deleted. Run with --delete once the list looks right.');
        return;
    }

    // In batches: one list of a thousand URLs is a request nobody should send.
    for (let index = 0; index < orphans.length; index += 100) {
        await del(orphans.slice(index, index + 100).map((blob) => blob.url));
    }

    console.log(`\nDeleted ${orphans.length} file(s), ${mb} MB.`);
}

main()
    .catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
