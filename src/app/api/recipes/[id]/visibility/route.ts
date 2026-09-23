import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';
import { forgetCollectionFacets } from '@/lib/collectionFacets';

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

/*
 * `onlyMe`: the fourth stage, "Nur Admins" (lib/shareStage). Setting it also
 * unpublishes the recipe and withdraws its link, in the same write, so there
 * is no moment in which it is the admins' and still on the web.
 */
const schema = z.union([z.object({ isPublic: z.boolean() }), z.object({ onlyMe: z.boolean() })]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const recipeId = positiveIntId(id);

    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json({ message: 'Public or not?' }, { status: 400 });
    }

    if ('onlyMe' in parsed.data) {
        const onlyMe = parsed.data.onlyMe;
        try {
            const updated = await prisma.recipe.updateMany({
                where: { id: recipeId },
                data: onlyMe ? { onlyMe: true, isPublic: false, shareToken: null } : { onlyMe: false },
            });
            if (updated.count !== 1) return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
            forgetCollectionFacets();
            return NextResponse.json({ success: true, onlyMe, isPublic: false });
        } catch (error) {
            failed('Recipe audience update error:', error);
            return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
        }
    }

    try {
        /*
         * A draft cannot be made public, and the refusal lives here rather than
         * only in the button.
         *
         * `isDraft: false` in the WHERE clause rather than a read-then-write:
         * the conditional update is the same trick the share route already uses
         * for its token, and for the same reason — two requests that both read
         * "not a draft" and then both write would each believe they were the
         * one that checked.
         *
         * Turning something *off* is never refused. If a draft has somehow
         * ended up public, the way out must not be blocked by the rule that
         * should have stopped it going in.
         */
        const updated: { count: number } = await prisma.recipe.updateMany({
            // Nor an "only me" recipe: that is the opposite of public.
            where: { id: recipeId, ...(parsed.data.isPublic ? { isDraft: false, onlyMe: false } : {}) },
            data: { isPublic: parsed.data.isPublic },
        });

        if (updated.count !== 1) {
            const exists: { isDraft: boolean; onlyMe: boolean } | null = await prisma.recipe.findUnique({
                where: { id: recipeId },
                select: { isDraft: true, onlyMe: true },
            });

            if (exists?.onlyMe) {
                return NextResponse.json({ message: 'onlyMe', onlyMe: true }, { status: 409 });
            }

            if (exists?.isDraft) {
                return NextResponse.json(
                    { message: 'draft', isDraft: true },
                    { status: 409 }
                );
            }

            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 404 });
        }

        return NextResponse.json({ success: true, isPublic: parsed.data.isPublic });
    } catch (error) {
        failed('Recipe visibility failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
