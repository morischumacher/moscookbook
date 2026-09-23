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

/*
 * Cut to size rather than refused. One recipe from another app with a long
 * description refused the whole batch of five — and the import stopped
 * there, with everything after it never tried.
 */
const text = (max: number) => z.string().default('').transform((value) => value.slice(0, max));
const count = (min: number, max: number) =>
    z.number().nullable().default(null).transform((value) =>
        value === null || !Number.isFinite(value) ? null : Math.min(max, Math.max(min, Math.round(value)))
    );

const body = z.object({
    recipes: z
        .array(
            z.object({
                title: z.string().trim().min(1).transform((value) => value.slice(0, 200)),
                description: text(4000),
                ingredients: z
                    .array(z.object({ amount: text(120), item: text(200) }))
                    .default([])
                    .transform((rows) => rows.slice(0, 200)),
                instructions: text(50_000),
                servings: count(1, 100),
                prepMinutes: count(0, 10_000),
                cookMinutes: count(0, 10_000),
                category: text(100),
                tags: z.array(z.string()).default([]).transform((tags) => tags.slice(0, 30).map((tag) => tag.slice(0, 60))),
                sourceUrl: webUrl.catch(''),
                imageUrl: webUrl.catch(''),
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
