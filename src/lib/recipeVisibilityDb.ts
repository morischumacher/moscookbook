import prisma from './prisma';

/**
 * Whether a recipe is hidden from this person — the check for the routes
 * that act on a recipe by its id (rating, favourite, cooked), where a member
 * guessing the id of an "only me" recipe must get what a missing one gets.
 */
export async function hiddenFrom(recipeId: number, user: { admin: boolean } | null | undefined): Promise<boolean> {
    if (user?.admin) return false;
    const row = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { onlyMe: true } });
    return Boolean(row?.onlyMe);
}
