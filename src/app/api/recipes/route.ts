import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { recipeInputSchema, formatZodError } from '@/lib/recipeSchema';

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const parsed = recipeInputSchema.safeParse(await req.json());

        if (!parsed.success) {
            return NextResponse.json(
                { message: formatZodError(parsed.error) },
                { status: 400 }
            );
        }

        const {
            title, slug, description, category, nationality,
            ingredients, instructions, imageUrl,
            servings, prepMinutes, cookMinutes,
        } = parsed.data;

        const recipe = await prisma.recipe.create({
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
                images: imageUrl ? { create: { url: imageUrl } } : undefined,
                ingredients: {
                    create: toStructuredIngredients(ingredients).map((row, index) => ({
                        ...row,
                        position: index,
                    })),
                },
            },
        });

        return NextResponse.json(recipe, { status: 201 });
    } catch (error) {
        if (isPrismaError(error, 'P2002')) {
            return NextResponse.json(
                { message: 'A recipe with this slug already exists. Please choose a different one.' },
                { status: 409 }
            );
        }

        console.error('Create recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
