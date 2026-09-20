#!/usr/bin/env node
/**
 * Puts a backup folder back into the database.
 *
 *   npm run restore -- backup/2026-09-20
 *   npm run restore -- backup/2026-09-20 --replace
 *
 * Images are re-uploaded from the folder, so this works even when the original
 * Blob store is gone — which is the case a backup exists for.
 *
 * Existing recipes are kept unless --replace is given: a restore that silently
 * overwrites what you have been editing is a second disaster, not a recovery.
 */
import { PrismaClient } from '@prisma/client';
import { put } from '@vercel/blob';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

const prisma = new PrismaClient();

const CONTENT_TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
};

async function main() {
    const directory = process.argv[2];
    const replace = process.argv.includes('--replace');

    if (!directory || directory.startsWith('--')) {
        throw new Error('Usage: npm run restore -- <backup folder> [--replace]');
    }

    const archive = JSON.parse(await readFile(path.join(directory, 'recipes.json'), 'utf8'));

    if (archive.version > 1) {
        throw new Error(`Archive version ${archive.version} is newer than this script understands.`);
    }

    let imageMap = {};
    try {
        imageMap = JSON.parse(await readFile(path.join(directory, 'images.json'), 'utf8'));
    } catch {
        console.warn('No images.json found — image URLs will be kept as they are.');
    }

    // Upload each file once, even when several recipes share it.
    const uploaded = new Map();

    async function urlFor(originalUrl) {
        if (uploaded.has(originalUrl)) return uploaded.get(originalUrl);

        const filename = imageMap[originalUrl];
        if (!filename) return originalUrl;

        try {
            const buffer = await readFile(path.join(directory, 'images', filename));
            const extension = filename.split('.').pop().toLowerCase();
            const blob = await put(`restored_${Date.now()}_${filename}`, buffer, {
                access: 'public',
                contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
            });
            uploaded.set(originalUrl, blob.url);
            return blob.url;
        } catch (error) {
            console.warn(`  could not re-upload ${filename}: ${error.message}`);
            uploaded.set(originalUrl, originalUrl);
            return originalUrl;
        }
    }

    const existing = await prisma.recipe.findMany({ select: { slug: true } });
    const existingSlugs = new Set(existing.map((recipe) => recipe.slug));

    let created = 0;
    let replaced = 0;
    let skipped = 0;

    for (const recipe of archive.recipes) {
        if (existingSlugs.has(recipe.slug)) {
            if (!replace) {
                skipped += 1;
                continue;
            }
            await prisma.recipe.delete({ where: { slug: recipe.slug } });
            replaced += 1;
        } else {
            created += 1;
        }

        const images = [];
        for (const original of recipe.images ?? []) images.push(await urlFor(original));

        await prisma.recipe.create({
            data: {
                title: recipe.title,
                slug: recipe.slug,
                description: recipe.description ?? null,
                instructions: recipe.instructions ?? '',
                category: recipe.category ?? null,
                nationality: recipe.nationality ?? null,
                servings: recipe.servings ?? null,
                prepMinutes: recipe.prepMinutes ?? null,
                cookMinutes: recipe.cookMinutes ?? null,
                createdAt: new Date(recipe.createdAt ?? Date.now()),
                images: { create: images.map((url) => ({ url })) },
                ingredients: {
                    create: (recipe.ingredients ?? []).map((ingredient, index) => ({
                        position: index,
                        quantity: ingredient.quantity ?? null,
                        quantityMax: ingredient.quantityMax ?? null,
                        unit: ingredient.unit ?? null,
                        name: ingredient.name,
                        raw: ingredient.raw ?? '',
                    })),
                },
            },
        });
    }

    console.log(`\ncreated ${created}, replaced ${replaced}, skipped ${skipped} of ${archive.recipes.length}`);
    if (skipped > 0 && !replace) console.log('Run again with --replace to overwrite the recipes that already exist.');
}

main()
    .catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
