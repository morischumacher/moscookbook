import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import {
    buildArchive,
    archiveFilename,
    type ExportableRecipe,
    type ExportablePost,
    type ExportableCookPhoto,
} from '@/lib/archive';

/**
 * Downloads the whole cookbook as one JSON file.
 *
 * Images are referenced by URL rather than embedded: a serverless response is
 * the wrong place to assemble tens of megabytes. `npm run backup` fetches the
 * files as well and is the one to run for a real offline copy.
 */
export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

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

        // Everything a person wrote or photographed, not only the recipes. A
        // backup that quietly stops covering what was added last month is the
        // one failure a backup exists to prevent, and scripts/check-backup.mjs
        // now refuses to let a new table slip past this query.
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

        const archive = buildArchive(recipes, new Date(), posts, cookPhotos);

        return new NextResponse(JSON.stringify(archive, null, 2), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="${archiveFilename()}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
