import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { freeRecipeSlug, newRecipeData } from '@/lib/recipeRepo';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { normaliseTags } from '@/lib/tags';
import { forgetCollectionFacets } from '@/lib/collectionFacets';

/**
 * Recipes read from another app's export (lib/foreignImport, in the
 * browser), a few at a time, into Drafts.
 *
 * Drafts, not recipes: an import is somebody else's typing, and three hundred
 * of it arriving in the list at once would bury the cookbook. A recipe whose
 * title is already here is skipped rather than doubled — importing the same
 * export twice must be harmless.
 */
const webUrl = z
    .string()
    .max(2048)
    .refine((value) => value === '' || /^https?:\/\//i.test(value))
    .default('');

const body = z.object({
    recipes: z
        .array(
            z.object({
                title: z.string().trim().min(1).max(200),
                description: z.string().max(4000).default(''),
                ingredients: z.array(z.object({ amount: z.string().max(120), item: z.string().max(200) })).max(200).default([]),
                instructions: z.string().max(50_000).default(''),
                servings: z.number().int().min(1).max(100).nullable().default(null),
                prepMinutes: z.number().int().min(0).max(10_000).nullable().default(null),
                cookMinutes: z.number().int().min(0).max(10_000).nullable().default(null),
                category: z.string().max(100).default(''),
                tags: z.array(z.string().max(60)).max(30).default([]),
                sourceUrl: webUrl,
                imageUrl: webUrl,
            })
        )
        .min(1)
        .max(10),
});

export const POST = route({ access: 'admin', body, label: 'Importing recipes' }, async ({ body: { recipes } }) => {
    const existing = await prisma.recipe.findMany({
        where: { OR: recipes.map((recipe) => ({ title: { equals: recipe.title, mode: 'insensitive' as const } })) },
        select: { title: true },
    });
    const known = new Set(existing.map((row) => row.title.toLowerCase()));

    let created = 0;
    const skipped: string[] = [];

    for (const recipe of recipes) {
        if (known.has(recipe.title.toLowerCase())) {
            skipped.push(recipe.title);
            continue;
        }
        known.add(recipe.title.toLowerCase());

        const source = recipe.sourceUrl ? `\n\n[${recipe.sourceUrl}](${recipe.sourceUrl})` : '';

        await prisma.recipe.create({
            data: newRecipeData({
                isDraft: true,
                title: recipe.title,
                slug: await freeRecipeSlug(recipe.title),
                description: recipe.description || null,
                category: recipe.category || null,
                nationality: null,
                instructions: (recipe.instructions || '—') + source,
                servings: recipe.servings,
                prepMinutes: recipe.prepMinutes,
                cookMinutes: recipe.cookMinutes,
                ingredients: toStructuredIngredients(recipe.ingredients),
                tags: normaliseTags(recipe.tags),
                imageUrls: recipe.imageUrl ? [recipe.imageUrl] : [],
            }),
            select: { id: true },
        });
        created += 1;
    }

    forgetCollectionFacets();
    return NextResponse.json({ created, skipped });
});
