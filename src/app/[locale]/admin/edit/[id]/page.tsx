import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import EditRecipeForm from '@/components/EditRecipeForm';

export default async function EditRecipePage({
    params
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params;
    const recipeId = parseInt(id, 10);

    if (isNaN(recipeId)) {
        notFound();
    }

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
        include: { images: true }
    });

    if (!recipe) {
        notFound();
    }

    const safeRecipe = {
        ...recipe,
        description: recipe.description || '',
        category: recipe.category || '',
        nationality: recipe.nationality || ''
    };

    return <EditRecipeForm recipe={safeRecipe} />;
}
