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
 *   images/        the image files themselves
 *   images.json    which URL each file came from
 */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import 'dotenv/config';

const prisma = new PrismaClient();

const ARCHIVE_VERSION = 1;

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
            images: { orderBy: { id: 'asc' }, select: { url: true } },
            ingredients: {
                orderBy: { position: 'asc' },
                select: { position: true, quantity: true, quantityMax: true, unit: true, name: true, raw: true },
            },
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
    };

    await writeFile(path.join(directory, 'recipes.json'), JSON.stringify(archive, null, 2));

    const urls = [...new Set(recipes.flatMap((recipe) => recipe.images.map((image) => image.url)))];
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

    console.log(`\n${recipes.length} recipes and ${downloaded} images written to ${directory}`);
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
