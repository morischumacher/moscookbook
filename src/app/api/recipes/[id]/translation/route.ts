import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { positiveIntId } from '@/lib/routeParams';
import { withHeadingRows } from '@/lib/ingredientParts';
import { sourceKey } from '@/lib/recipeTranslation';

/**
 * "Ist aktuell": the admin says a translation marked "the original has since
 * changed" still says what the original says — after a change of form only,
 * such as units spelled one way (migration 0057), which moved the
 * original's fingerprint without changing a word that matters.
 */
const body = z.object({ locale: z.enum(['de', 'en']) });

export const POST = route({ access: 'admin', body, label: 'Marking a translation up to date' }, async ({ params, body }) => {
    const id = positiveIntId((params as { id: string }).id);
    if (id === null) refuse(400, 'Which recipe?');
    const recipe = await prisma.recipe.findUnique({
        where: { id },
        select: {
            title: true,
            description: true,
            instructions: true,
            tips: true,
            ingredients: { orderBy: { position: 'asc' }, select: { raw: true, name: true, section: true } },
        },
    });
    if (!recipe) refuse(404, 'That recipe is gone.');
    // Built exactly as the page builds it when it decides "changed since".
    const source = sourceKey({
        title: recipe.title,
        description: recipe.description ?? '',
        instructions: recipe.instructions,
        tips: recipe.tips,
        ingredients: withHeadingRows(recipe.ingredients.map((row) => ({ amount: row.raw, item: row.name, section: row.section }))),
    });
    const updated = await prisma.recipeTranslation.updateMany({ where: { recipeId: id, locale: body.locale }, data: { source } });
    if (updated.count === 0) refuse(404, 'There is no translation to mark.');
    return NextResponse.json({ ok: true });
});
