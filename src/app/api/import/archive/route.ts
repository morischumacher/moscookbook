import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { parseArchive, type ArchiveRecipe } from '@/lib/archive';

const MAX_BODY_BYTES = 20 * 1024 * 1024;

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
        createdAt: new Date(recipe.createdAt),
        images: { create: recipe.images.map((url) => ({ url })) },
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

        for (const recipe of result.archive.recipes) {
            const exists = existingSlugs.has(recipe.slug);

            if (exists && !replace) {
                skipped += 1;
                continue;
            }

            if (exists) {
                // Cascades take the old images and ingredients with it.
                await prisma.recipe.delete({ where: { slug: recipe.slug } });
                replaced += 1;
            } else {
                created += 1;
            }

            await prisma.recipe.create({ data: recipeData(recipe) });
        }

        return NextResponse.json({ created, replaced, skipped, total: result.archive.recipes.length });
    } catch (error) {
        console.error('Archive import error:', error);
        return NextResponse.json({ message: 'The archive could not be imported.' }, { status: 500 });
    }
}
