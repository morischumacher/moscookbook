import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { recipeInputSchema, formatZodError, resolveImageUrls } from '@/lib/recipeSchema';
import { searchFields } from '@/lib/searchText';

function parseRecipeId(raw: string): number | null {
    const id = Number.parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
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
        const ingredientRows = toStructuredIngredients(ingredients).map((row, index) => ({
            ...row,
            recipeId,
            position: index,
        }));

        const [updatedRecipe] = await prisma.$transaction([
            prisma.recipe.update({
                where: { id: recipeId },
                data: {
                    title,
                    slug,
                    description,
                    category,
                    nationality,
                    instructions,
                    servings: servings ?? null,
                    prepMinutes: prepMinutes ?? null,
                    cookMinutes: cookMinutes ?? null,
                    ...searchFields({
                        title,
                        description,
                        instructions,
                        ingredients: ingredientRows.map((row) => row.name),
                    }),
                },
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

        console.error('Update recipe error:', error);
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

        // Images, ratings and favourites all cascade on delete in the schema,
        // so removing the recipe is enough.
        await prisma.recipe.delete({ where: { id: recipeId } });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        console.error('Delete recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
