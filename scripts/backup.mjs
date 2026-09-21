#!/usr/bin/env node
/**
 * Writes a complete offline copy of the cookbook.
 *
 *   npm run backup            -> backup/2026-09-20/
 *   npm run backup -- --out ~/Dropbox/moscookbook
 *
 * Unlike the browser export this also downloads the image files, so the copy
 * survives the Blob store going away. It talks to the database directly and
 * runs on your machine, which means no serverless time limit and no upload
 * size to worry about.
 *
 * The folder contains:
 *   recipes.json   a valid archive, importable as-is while the image URLs live
 *   images/        the image files themselves, the cooked photographs included
 *   images.json    which URL each file came from
 */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import 'dotenv/config';

const prisma = new PrismaClient();

// Kept in step with src/lib/archive.ts by hand, and checked by
// scripts/check-backup.mjs — this file had quietly stayed at 1 while the
// application moved to 2, which is exactly the drift that guard is for.
const ARCHIVE_VERSION = 3;

function outputDir() {
    const flag = process.argv.indexOf('--out');
    const base = flag !== -1 && process.argv[flag + 1] ? process.argv[flag + 1] : 'backup';
    return path.join(base, new Date().toISOString().slice(0, 10));
}

/** Stable, collision-free, and keeps the original extension. */
function localName(url) {
    const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
    const extension = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'jpg').toLowerCase();
    return `${hash}.${extension}`;
}

async function main() {
    const directory = outputDir();
    await mkdir(path.join(directory, 'images'), { recursive: true });

    const recipes = await prisma.recipe.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
            title: true, slug: true, description: true, instructions: true,
            category: true, nationality: true, servings: true, prepMinutes: true,
            cookMinutes: true, views: true, createdAt: true,
            images: { orderBy: { position: 'asc' }, select: { url: true } },
            ingredients: {
                orderBy: { position: 'asc' },
                select: { position: true, quantity: true, quantityMax: true, unit: true, name: true, raw: true },
            },
        },
    });

    const posts = await prisma.post.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
            title: true, slug: true, body: true, imageUrl: true,
            publishedAt: true, createdAt: true,
            recipe: { select: { slug: true } },
            author: { select: { name: true } },
        },
    });

    const cookPhotos = await prisma.cookPhoto.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
            url: true, caption: true, createdAt: true,
            recipe: { select: { slug: true } },
            user: { select: { name: true } },
        },
    });

    // Writing, and the only copy of it. "Half the chilli next time" is the
    // kind of line that is written once and missed by the person who wrote it.
    const cookLogs = await prisma.cookLog.findMany({
        orderBy: { cookedAt: 'asc' },
        select: {
            cookedAt: true, note: true,
            recipe: { select: { slug: true } },
            user: { select: { name: true } },
        },
    });

    const archive = {
        version: ARCHIVE_VERSION,
        exportedAt: new Date().toISOString(),
        recipeCount: recipes.length,
        recipes: recipes.map((recipe) => ({
            ...recipe,
            createdAt: recipe.createdAt.toISOString(),
            images: recipe.images.map((image) => image.url),
            ingredients: recipe.ingredients.map((ingredient, index) => ({ ...ingredient, position: index })),
        })),
        // By slug, not by id: this file is restored into a database where every
        // id is new. See src/lib/archive.ts, which this mirrors.
        posts: posts.map((post) => ({
            title: post.title,
            slug: post.slug,
            body: post.body,
            imageUrl: post.imageUrl,
            publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
            createdAt: post.createdAt.toISOString(),
            recipeSlug: post.recipe?.slug ?? null,
            author: post.author?.name ?? null,
        })),
        cookPhotos: cookPhotos.map((photo) => ({
            url: photo.url,
            caption: photo.caption,
            createdAt: photo.createdAt.toISOString(),
            recipeSlug: photo.recipe.slug,
            author: photo.user?.name ?? null,
        })),
        cookLogs: cookLogs.map((entry) => ({
            recipeSlug: entry.recipe.slug,
            cookedAt: entry.cookedAt.toISOString(),
            note: entry.note,
            author: entry.user?.name ?? null,
        })),
    };

    await writeFile(path.join(directory, 'recipes.json'), JSON.stringify(archive, null, 2));

    // Every picture the cookbook points at, not only a recipe's own: what
    // people photographed in their kitchens is the part that exists nowhere
    // else.
    const urls = [
        ...new Set([
            ...recipes.flatMap((recipe) => recipe.images.map((image) => image.url)),
            ...posts.map((post) => post.imageUrl).filter(Boolean),
            ...cookPhotos.map((photo) => photo.url),
        ]),
    ];
    const map = {};
    let downloaded = 0;
    let failed = 0;

    for (const url of urls) {
        const name = localName(url);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            await writeFile(path.join(directory, 'images', name), buffer);
            map[url] = name;
            downloaded += 1;
        } catch (error) {
            // One unreachable image must not cost you the whole backup.
            failed += 1;
            console.warn(`  could not fetch ${url}: ${error.message}`);
        }
    }

    await writeFile(path.join(directory, 'images.json'), JSON.stringify(map, null, 2));

    console.log(
        `\n${recipes.length} recipes, ${posts.length} entries, ${cookPhotos.length} cooked photos ` +
        `and ${downloaded} images written to ${directory}`
    );
    if (failed > 0) console.log(`${failed} image(s) could not be fetched — see the warnings above.`);
}

main()
    .catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
