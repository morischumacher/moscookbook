import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { requireAdmin } from '@/lib/auth';
import { deleteBlobs } from '@/lib/blobCleanup';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { recipeInputSchema, formatZodError, resolveImageUrls } from '@/lib/recipeSchema';
import { ingredientRows as positioned, recipeColumns } from '@/lib/recipeRepo';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

function parseRecipeId(raw: string): number | null {
    return positiveIntId(raw);
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await context.params;
        const recipeId = parseRecipeId(id);

        if (recipeId === null) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        const parsed = recipeInputSchema.safeParse(await req.json());

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

        // null means the request said nothing about pictures, which is not the
        // same as an empty list. Saving an edit without touching the gallery
        // must not empty it — that bug has been fixed here once already.
        const imageUrls = resolveImageUrls(parsed.data);

        const replaceImages = imageUrls !== null;

        // Ingredient rows are replaced wholesale rather than diffed: the list is
        // short, order matters, and a rewrite keeps positions contiguous.
        const structured = toStructuredIngredients(ingredients);
        const ingredientRows = positioned(structured).map((row) => ({ ...row, recipeId }));

        // Which files this edit is about to stop pointing at. Read before the
        // write, because after it there is nothing left to ask. Deleting a
        // recipe has always taken its pictures with it; editing one quietly did
        // not, so every photograph ever removed or reordered out of a recipe
        // stayed in the store, unreachable and still paid for.
        const droppedUrls: string[] = [];

        if (replaceImages) {
            const before: { url: string }[] = await prisma.image.findMany({
                where: { recipeId },
                select: { url: true },
            });

            const kept = new Set(imageUrls ?? []);
            for (const image of before) {
                if (!kept.has(image.url)) droppedUrls.push(image.url);
            }
        }

        const [updatedRecipe] = await prisma.$transaction([
            prisma.recipe.update({
                where: { id: recipeId },
                data: recipeColumns({
                    title,
                    slug,
                    description,
                    category,
                    nationality,
                    instructions,
                    servings,
                    prepMinutes,
                    cookMinutes,
                    ingredients: structured,
                }),
            }),
            prisma.ingredient.deleteMany({ where: { recipeId } }),
            prisma.ingredient.createMany({ data: ingredientRows }),
            // Replaced wholesale rather than diffed, like the ingredients: the
            // list is short, the order is what the author arranged, and a
            // rewrite keeps positions contiguous.
            ...(replaceImages ? [prisma.image.deleteMany({ where: { recipeId } })] : []),
            ...(replaceImages && imageUrls && imageUrls.length > 0
                ? [
                    prisma.image.createMany({
                        data: imageUrls.map((url, index) => ({ recipeId, url, position: index })),
                    }),
                ]
                : []),
        ]);

        // After the transaction, never inside it: a file cannot be un-deleted
        // if the write rolls back, and a row pointing at a missing picture is a
        // worse outcome than a file nobody points at.
        if (droppedUrls.length > 0) await deleteBlobs(droppedUrls);

        // The category or cuisine may have changed, and with it the rail.
        forgetCollectionFacets();

        return NextResponse.json(updatedRecipe, { status: 200 });
    } catch (error) {
        if (isPrismaError(error, 'P2002')) {
            return NextResponse.json(
                { message: 'A recipe with this slug already exists. Please choose a different one.' },
                { status: 409 }
            );
        }
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        failed('Update recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await context.params;
        const recipeId = parseRecipeId(id);

        if (recipeId === null) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        // The URLs are read before the row goes, because afterwards there is
        // nothing left to read them from. Rows first, files second: a delete
        // that removed the files and then failed on the row would leave a
        // recipe pointing at pictures that no longer exist, which is worse
        // than a file nobody is pointing at.
        const doomed: {
            images: { url: string }[];
            cookEntries: { photos: { url: string }[] }[];
        } | null = await prisma.recipe.findUnique({
            where: { id: recipeId },
            select: {
                images: { select: { url: true } },
                cookEntries: { select: { photos: { select: { url: true } } } },
            },
        });

        // Images, cooking entries with their photographs, ratings and
        // favourites all cascade on delete in the schema, so removing the
        // recipe is enough for the rows.
        await prisma.recipe.delete({ where: { id: recipeId } });

        if (doomed) {
            await deleteBlobs([
                ...doomed.images.map((image) => image.url),
                ...doomed.cookEntries.flatMap((entry) =>
                    entry.photos.map((photo) => photo.url)
                ),
            ]);
        }

        // One fewer recipe, and possibly one fewer category.
        forgetCollectionFacets();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        failed('Delete recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
