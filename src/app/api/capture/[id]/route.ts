import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireAdmin } from '@/lib/auth';
import { slugify } from '@/lib/recipe';
import { searchFields } from '@/lib/searchText';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { processCapture } from '@/lib/captureProcess';
import { aiCapability } from '@/lib/aiConfig';
import type { ImportedRecipe } from '@/lib/recipeFromHtml';
import { toJsonObject } from '@/lib/json';

/**
 * `askAi` is the button on a draft the scoring called good.
 *
 * A separate action rather than a flag on `retry`, because they are separate
 * decisions: retry means "the parser may do better now", askAi means "I have
 * looked at this and I want a model's reading of it". The second one costs
 * money and the first does not, and a name that says which is which is worth
 * the extra enum member.
 */
const actionSchema = z.object({ action: z.enum(['retry', 'askAi', 'publish']) });

function parseId(raw: string): number | null {
    const id = Number.parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
}

/**
 * A slug nobody has taken yet.
 *
 * Publishing from the inbox is meant to be one click, so a clash cannot be
 * allowed to stop it and ask a question. The same dish arriving twice is a
 * thing that happens — two people send you the same video — and getting
 * "-2" is a far better outcome than an error in a queue.
 */
async function freeSlug(title: string): Promise<string> {
    const base = slugify(title) || 'rezept';

    for (let attempt = 0; attempt < 50; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
        const taken = await prisma.recipe.findUnique({
            where: { slug: candidate },
            select: { id: true },
        });
        if (!taken) return candidate;
    }

    return `${base}-${Date.now()}`;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await context.params;
    const captureId = parseId(id);
    if (captureId === null) {
        return NextResponse.json({ message: 'Invalid capture id' }, { status: 400 });
    }

    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Unknown action' }, { status: 400 });
    }

    const capture = await prisma.capture.findUnique({ where: { id: captureId } });
    if (!capture) {
        return NextResponse.json({ message: 'Capture not found' }, { status: 404 });
    }

    if (parsed.data.action === 'retry' || parsed.data.action === 'askAi') {
        // `retry`: the same capture, read again — worth pressing after a key
        // has been pasted in, or after the parser has improved.
        //
        // `askAi`: the same, except that the quality gate is skipped. The
        // scoring is a guess about whether asking would help; somebody looking
        // at the draft knows better, and the scoring exists to save them the
        // trouble rather than to overrule them.
        const result = await processCapture(capture, await aiCapability(), {
            force: parsed.data.action === 'askAi',
        });
        const updated = await prisma.capture.update({
            where: { id: captureId },
            data: {
                status: result.status,
                error: result.error,
                readBy: result.readBy,
                aiProvider: result.provider,
                draft: result.draft ? toJsonObject(result.draft) : undefined,
                processedAt: new Date(),
            },
        });
        return NextResponse.json({ capture: updated });
    }

    const draft = capture.draft as unknown as ImportedRecipe | null;

    // `draft` is an untyped JSON column that `retry` writes whatever the
    // processor produced into, so a title is something to check for rather
    // than something to assume. `draft.title.trim()` on a draft without one
    // threw a TypeError out of a handler with no catch: an HTML 500, and the
    // inbox showing only "something went wrong".
    if (
        !draft ||
        typeof draft.title !== 'string' ||
        typeof draft.instructions !== 'string' ||
        !draft.title.trim() ||
        !draft.instructions.trim()
    ) {
        return NextResponse.json(
            { message: 'This capture has no complete recipe yet. Open it and finish it first.' },
            { status: 422 }
        );
    }

    /*
     * Claim the capture before creating anything.
     *
     * The guard used to be the read above — `capture.status === 'published'` —
     * and the write that closed it came after the recipe was created. Two
     * requests could both pass it and both create a recipe, and because
     * `freeSlug` deliberately never collides, the result was two recipes,
     * "Zwetschgendatschi" and "zwetschgendatschi-2", with the capture pointing
     * at whichever finished last. The inbox disables its own row while it
     * works, which covers one tab and not a retried request after a gateway
     * timeout, or a second tab.
     *
     * updateMany with the condition in the WHERE clause is atomic: exactly one
     * caller gets count === 1, the same pattern registration and the password
     * reset already use to redeem a token.
     */
    const claimed = await prisma.capture.updateMany({
        where: { id: captureId, status: { not: 'published' } },
        data: { status: 'published' },
    });

    if (claimed.count !== 1) {
        return NextResponse.json(
            { message: 'This capture has already become a recipe.' },
            { status: 409 }
        );
    }

    const ingredientRows = toStructuredIngredients(draft.ingredients);

    try {
        const recipe = await prisma.recipe.create({
            data: {
                title: draft.title.trim(),
                slug: await freeSlug(draft.title),
                description: draft.description || null,
                category: draft.category || null,
                nationality: draft.nationality || null,
                instructions: draft.instructions,
                servings: draft.servings ?? null,
                prepMinutes: draft.prepMinutes ?? null,
                cookMinutes: draft.cookMinutes ?? null,
                ...searchFields({
                    title: draft.title,
                    description: draft.description,
                    instructions: draft.instructions,
                    ingredients: ingredientRows.map((row) => row.name),
                }),
                images: draft.imageUrl ? { create: { url: draft.imageUrl, position: 0 } } : undefined,
                ingredients: {
                    create: ingredientRows.map((row, index) => ({ ...row, position: index })),
                },
            },
            select: { id: true, slug: true, title: true },
        });

        await prisma.capture.update({
            where: { id: captureId },
            data: { recipeId: recipe.id, error: null },
        });

        // Publishing a capture is a recipe appearing, with a category the
        // filter rail has never seen. See lib/collectionFacets.
        forgetCollectionFacets();

        return NextResponse.json({ recipe }, { status: 201 });
    } catch (error) {
        // The claim is given back, or a capture that failed to become a recipe
        // would sit in the inbox marked published with nothing to show for it
        // and no way to try again.
        await prisma.capture
            .updateMany({
                where: { id: captureId, recipeId: null },
                data: {
                    status: 'ready',
                    error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
                },
            })
            .catch(() => undefined);

        console.error('Publishing a capture failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * Discards a capture.
 *
 * A real delete, not a status: the inbox is a queue, and a queue that only ever
 * grows stops being read. What was published keeps its own record on the recipe.
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await context.params;
    const captureId = parseId(id);
    if (captureId === null) {
        return NextResponse.json({ message: 'Invalid capture id' }, { status: 400 });
    }

    // The screenshot goes with it. Discarding is how most captures end — far
    // more of them than are ever published — so this was the largest of the
    // three places that left files in the store with nothing pointing at them.
    // A published capture's picture is not touched: by then the recipe owns it.
    const doomed: { imageUrl: string | null; status: string } | null =
        await prisma.capture.findUnique({
            where: { id: captureId },
            select: { imageUrl: true, status: true },
        });

    const removed = await prisma.capture.deleteMany({ where: { id: captureId } });

    if (removed.count === 1 && doomed?.imageUrl && doomed.status !== 'published') {
        await deleteBlobs([doomed.imageUrl]);
    }

    return NextResponse.json({ ok: true });
}
