import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { idFrom, refuse, route } from '@/lib/route';
import { readSnapshot, snapshotOf } from '@/lib/revisions';
import { keepRevisionOf } from '@/lib/revisionsDb';
import { recipeColumns } from '@/lib/recipeRepo';
import { splitAmount } from '@/lib/ingredientParts';
import { forgetCollectionFacets } from '@/lib/collectionFacets';

/**
 * Puts a recipe back the way an earlier version had it.
 *
 * The version being replaced is kept first, like any edit, so a restore can
 * itself be undone. Two things are not restored: the pictures (an edit
 * deletes the files it drops, so an old list may point at nothing) and the
 * address (a link somebody has to today's address must keep working).
 */
export const POST = route<'admin', undefined, { id: string; revisionId: string }>(
    { access: 'admin', label: 'Restoring a recipe version' },
    async ({ user, params }) => {
        const recipeId = idFrom(params.id, 'recipe ID');
        const revisionId = idFrom(params.revisionId, 'version');

        const [revision, current] = await Promise.all([
            prisma.recipeRevision.findFirst({ where: { id: revisionId, recipeId }, select: { snapshot: true } }),
            prisma.recipe.findUnique({
                where: { id: recipeId },
                select: {
                    title: true, slug: true, description: true, category: true, nationality: true,
                    instructions: true, servings: true, prepMinutes: true, cookMinutes: true, tags: true,
                    ingredients: { orderBy: { position: 'asc' }, select: { raw: true, name: true, section: true } },
                },
            }),
        ]);
        if (!revision || !current) refuse(404, 'That version is not there.');

        const snapshot = readSnapshot(revision.snapshot);
        if (!snapshot) refuse(422, 'That version cannot be read.');

        await keepRevisionOf(recipeId, snapshotOf(current), user.name);

        const ingredients = snapshot.ingredients.map((row) => ({ ...splitAmount(row.raw), name: row.name, raw: row.raw, section: row.section }));

        await prisma.$transaction([
            prisma.recipe.update({
                where: { id: recipeId },
                data: recipeColumns({ ...snapshot, slug: current.slug, ingredients }),
            }),
            prisma.ingredient.deleteMany({ where: { recipeId } }),
            prisma.ingredient.createMany({
                data: ingredients.map((row, position) => ({ ...row, recipeId, position })),
            }),
        ]);

        forgetCollectionFacets();
        return NextResponse.json({ restored: true, slug: current.slug });
    }
);
