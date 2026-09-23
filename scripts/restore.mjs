#!/usr/bin/env node
/**
 * Makes a backup folder restorable when its pictures' original store is gone.
 *
 *   npm run restore -- backup/2026-09-20
 *
 * Every picture in the folder is uploaded to this deployment's Blob store,
 * and the archive is written again with the new addresses in place of the
 * old ones — in the recipes' galleries, on posts and collections, on cook
 * entries, and inside the text of a post, wherever the old address appears.
 * The result, `recipes.restorable.json` in the same folder, is then imported
 * where every other archive is: Verwaltung → Sicherung → "Aus Datei
 * wiederherstellen", which knows every version and every kind of row.
 *
 * It used to write recipes into the database itself. That copy of the import
 * understood only version 1 of the archive — it refused every backup
 * `npm run backup` has written since — and knew nothing of posts, cook
 * entries, collections, menus or translations. One importer, the one the
 * site uses and the tests cover, is the only kind that stays right.
 */
import { put } from '@vercel/blob';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

const CONTENT_TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', heic: 'image/heic',
};

async function main() {
    const directory = process.argv[2];

    if (!directory || directory.startsWith('--')) {
        throw new Error('Usage: npm run restore -- <backup folder>');
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error('BLOB_READ_WRITE_TOKEN is not set: there is nowhere to put the pictures.');
    }

    let text = await readFile(path.join(directory, 'recipes.json'), 'utf8');
    const archive = JSON.parse(text);
    console.log(`Archive version ${archive.version}, ${archive.recipes?.length ?? 0} recipes.`);

    let imageMap = {};
    try {
        imageMap = JSON.parse(await readFile(path.join(directory, 'images.json'), 'utf8'));
    } catch {
        console.warn('No images.json found — nothing to upload; the addresses stay as they are.');
    }

    let uploaded = 0;
    let failed = 0;

    for (const [originalUrl, filename] of Object.entries(imageMap)) {
        // Only what the archive still mentions.
        if (!text.includes(originalUrl)) continue;
        try {
            const buffer = await readFile(path.join(directory, 'images', filename));
            const extension = filename.split('.').pop().toLowerCase();
            const blob = await put(`restored/${Date.now()}_${filename}`, buffer, {
                access: 'public',
                contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
            });
            text = text.split(originalUrl).join(blob.url);
            uploaded += 1;
        } catch (error) {
            // The old address stays: if that store still answers, it still works.
            failed += 1;
            console.warn(`  could not upload ${filename}: ${error.message}`);
        }
    }

    const out = path.join(directory, 'recipes.restorable.json');
    await writeFile(out, text);

    console.log(`\n${uploaded} pictures uploaded${failed ? `, ${failed} failed` : ''}.`);
    console.log(`Written: ${out}`);
    console.log('Import it in the cookbook: Verwaltung → Sicherung → "Aus Datei wiederherstellen".');
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
