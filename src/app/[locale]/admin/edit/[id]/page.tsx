import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import RecipeForm from '@/components/recipe-form/RecipeForm';
import { canUseAi } from '@/lib/aiProviders';
import { aiCapability } from '@/lib/aiConfig';

interface EditableRecipe {
    id: number;
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    nationality: string | null;
    instructions: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    images: { url: string }[];
    ingredients: { raw: string; name: string }[];
}

export default async function EditRecipePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const recipeId = Number.parseInt(id, 10);

    if (Number.isNaN(recipeId)) notFound();

    const recipe: EditableRecipe | null = await prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
            images: { orderBy: { position: 'asc' } },
            ingredients: { orderBy: { position: 'asc' } },
        },
    });

    if (!recipe) notFound();

    return (
        <RecipeForm
            mode="edit"
            aiEnabled={canUseAi(await aiCapability())}
            initial={{
                id: recipe.id,
                title: recipe.title,
                slug: recipe.slug,
                description: recipe.description ?? '',
                category: recipe.category ?? '',
                nationality: recipe.nationality ?? '',
                instructions: recipe.instructions,
                ingredients: recipe.ingredients.map((row) => ({
                    amount: row.raw,
                    item: row.name,
                })),
                imageUrls: recipe.images.map((image) => image.url),
                servings: recipe.servings,
                prepMinutes: recipe.prepMinutes,
                cookMinutes: recipe.cookMinutes,
            }}
        />
    );
}
