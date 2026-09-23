import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { requireAdmin } from '@/lib/auth';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { recipeInputSchema, formatZodError, resolveImageUrls } from '@/lib/recipeSchema';
import { newRecipeData } from '@/lib/recipeRepo';
import { failed } from '@/lib/reportServerError';
import { syncWorkItem } from '@/lib/workItemsDb';
import { releaseCaptureScreenshots } from '@/lib/captureCleanup';
import { positiveIntId } from '@/lib/routeParams';

/** Thrown inside the transaction to undo the recipe when its capture was already published. */
class AlreadyPublished extends Error {}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const body = await req.json().catch(() => null);
        const parsed = recipeInputSchema.safeParse(body);

        // Optional and outside the schema on purpose: it is not part of a
        // recipe, only of where this one came from.
        const rawCaptureId = (body as { captureId?: unknown })?.captureId;
        // An id Postgres can hold: a larger one threw after the recipe was saved.
        const captureId = typeof rawCaptureId === 'number' ? positiveIntId(String(rawCaptureId)) : null;

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

        /*
         * The recipe and the capture it came from, together. A capture that is
         * already a recipe — published from the inbox, or from another tab —
         * is not published again: that made a second recipe and then deleted
         * the first one's picture along with the capture's screenshots.
         */
        const recipe = await prisma.$transaction(async (tx) => {
            const made = await tx.recipe.create({
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
                    categories: parsed.data.categories,
                    cuisines: parsed.data.cuisines,
                    spiciness: parsed.data.spiciness,
                    language: parsed.data.language,
                    onlyMe: parsed.data.onlyMe,
                    translation: parsed.data.translation,
                    imageUrls,
                }),
            });
            if (captureId !== null) {
                // updateMany: a capture deleted in another tab is no reason
                // not to save the recipe.
                const claimed = await tx.capture.updateMany({
                    where: { id: captureId, status: { not: 'published' } },
                    data: { status: 'published', recipeId: made.id, error: null },
                });
                if (claimed.count === 0 && (await tx.capture.count({ where: { id: captureId } })) > 0) throw new AlreadyPublished();
            }
            return made;
        });

        // Closing the loop from the inbox.
        if (captureId !== null) {
            await syncWorkItem('capture', captureId);
            // Its screenshots the recipe did not take go — but only when it
            // took a picture at all: a recipe saved with none is not a
            // reason to delete what was shared.
            if (imageUrls.length > 0) await releaseCaptureScreenshots(captureId, imageUrls).catch(() => undefined);
        }

        // A new recipe can bring a category nobody has used before, and the
        // filter rail is computed once and kept. See lib/collectionFacets.
        forgetCollectionFacets();

        return NextResponse.json(recipe, { status: 201 });
    } catch (error) {
        if (error instanceof AlreadyPublished) {
            return NextResponse.json({ message: 'This inbox entry is already a recipe.' }, { status: 409 });
        }
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
