import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

/**
 * Publishing one recipe, or taking it back.
 *
 * Its own endpoint rather than a field on the recipe form, and that is a
 * decision rather than convenience. Visibility is not a property of the text
 * somebody is writing; it is an act performed on a finished recipe, and it is
 * the only act in this application that puts something on the open web. It
 * belongs where it can be seen and reversed — on the recipe — not buried in a
 * long form beside the cooking time, where a stray click while editing an
 * ingredient could publish a household's kitchen.
 *
 * Admin only. Everyone here is trusted, but "trusted" and "allowed to publish"
 * are different permissions, and the second one is the irreversible kind:
 * un-publishing removes the page, not the copy a search engine took.
 */

const schema = z.object({ isPublic: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const recipeId = Number.parseInt(id, 10);

    if (!Number.isInteger(recipeId) || recipeId <= 0) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json({ message: 'Public or not?' }, { status: 400 });
    }

    try {
        const updated: { count: number } = await prisma.recipe.updateMany({
            where: { id: recipeId },
            data: { isPublic: parsed.data.isPublic },
        });

        if (updated.count !== 1) {
            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 404 });
        }

        return NextResponse.json({ success: true, isPublic: parsed.data.isPublic });
    } catch (error) {
        console.error('Recipe visibility failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
