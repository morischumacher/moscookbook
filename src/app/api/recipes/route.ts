import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { requireAdmin } from '@/lib/auth';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { recipeInputSchema, formatZodError, resolveImageUrls } from '@/lib/recipeSchema';
import { newRecipeData } from '@/lib/recipeRepo';
import { failed } from '@/lib/reportServerError';

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const body = await req.json();
        const parsed = recipeInputSchema.safeParse(body);

        // Optional and outside the schema on purpose: it is not part of a
        // recipe, only of where this one came from.
        const rawCaptureId = (body as { captureId?: unknown })?.captureId;
        const captureId = typeof rawCaptureId === 'number' && Number.isInteger(rawCaptureId)
            ? rawCaptureId
            : null;

        if (!parsed.success) {
            return NextResponse.json(
                { message: formatZodError(parsed.error) },
                { status: 400 }
            );
        }

        const {
            title, slug, description, category, nationality,
            ingredients, instructions,
            servings, prepMinutes, cookMinutes,
        } = parsed.data;

        const imageUrls = resolveImageUrls(parsed.data) ?? [];

        const recipe = await prisma.recipe.create({
            data: newRecipeData({
                title,
                slug,
                description,
                category,
                nationality,
                instructions,
                servings,
                prepMinutes,
                cookMinutes,
                ingredients: toStructuredIngredients(ingredients),
                tags: parsed.data.tags,
                imageUrls,
            }),
        });

        // Closing the loop from the inbox. updateMany rather than update so a
        // capture someone deleted in another tab cannot fail a save that has
        // already happened.
        if (captureId !== null) {
            await prisma.capture.updateMany({
                where: { id: captureId },
                data: { status: 'published', recipeId: recipe.id, error: null },
            });
        }

        // A new recipe can bring a category nobody has used before, and the
        // filter rail is computed once and kept. See lib/collectionFacets.
        forgetCollectionFacets();

        return NextResponse.json(recipe, { status: 201 });
    } catch (error) {
        if (isPrismaError(error, 'P2002')) {
            return NextResponse.json(
                { message: 'A recipe with this slug already exists. Please choose a different one.' },
                { status: 409 }
            );
        }

        failed('Create recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
