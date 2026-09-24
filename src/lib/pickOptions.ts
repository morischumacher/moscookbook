import prisma from './prisma';
import type { PickOption } from '@/components/ui/PickList';

/**
 * The finished recipes, as a picker offers them: title and first picture.
 *
 * Drafts are not offered. A draft cannot carry a post, and a collection of
 * drafts would put unfinished recipes on a shared page.
 */
/**
 * `forPost`: a post is read by the household, and the server refuses one
 * about an "only me" recipe (lib/postLinks) — offered here, it could be
 * picked and then never saved.
 */
export async function recipeOptions(forPost = false): Promise<PickOption[]> {
    const recipes = await prisma.recipe.findMany({
        where: { isDraft: false, ...(forPost ? { onlyMe: false } : {}) },
        orderBy: { title: 'asc' },
        select: {
            id: true,
            title: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
    });
    return recipes.map((recipe) => ({ id: recipe.id, title: recipe.title, image: recipe.images[0]?.url ?? null }));
}

export async function collectionOptions(): Promise<PickOption[]> {
    const collections = await prisma.collection.findMany({
        orderBy: { title: 'asc' },
        select: { id: true, title: true, imageUrl: true },
    });
    return collections.map((collection) => ({ id: collection.id, title: collection.title, image: collection.imageUrl }));
}
