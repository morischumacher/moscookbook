import prisma from './prisma';
import { toJsonObject } from './json';
import { KEEP_REVISIONS, type RecipeSnapshot } from './revisions';

/**
 * Stores a replaced version and lets the oldest go beyond `KEEP_REVISIONS`.
 * After the edit, never inside it: a history that could not be written must
 * not cost the edit itself, so a failure here is logged and forgotten.
 */
export async function keepRevisionOf(recipeId: number, snapshot: RecipeSnapshot, editedBy: string | null): Promise<void> {
    try {
        await prisma.recipeRevision.create({
            data: { recipeId, snapshot: toJsonObject(snapshot), editedBy },
        });

        const stale = await prisma.recipeRevision.findMany({
            where: { recipeId },
            orderBy: { createdAt: 'desc' },
            skip: KEEP_REVISIONS,
            select: { id: true },
        });
        if (stale.length > 0) {
            await prisma.recipeRevision.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
        }
    } catch (error) {
        console.error('Could not keep a recipe revision:', error);
    }
}
