import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireAdmin } from '@/lib/auth';
import { freeRecipeSlug, newRecipeData } from '@/lib/recipeRepo';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { processCapture, readWithAiOnly } from '@/lib/captureProcess';
import { canUseAi } from '@/lib/aiImport';
import { siteLearning } from '@/lib/siteProfileDb';
import { aiCapability } from '@/lib/aiConfig';
import { toJsonObject } from '@/lib/json';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';
import { draftFromJson } from '@/lib/captureDraft';
import { syncWorkItem } from '@/lib/workItemsDb';
import { usageRecorder } from '@/lib/tokenUsageDb';
import { mirrorImageToBlob } from '@/lib/mirrorImage';
import { releaseCaptureScreenshots } from '@/lib/captureCleanup';

/**
 * `askAi` is the button on a draft the scoring called good.
 *
 * A separate action rather than a flag on `retry`, because they are separate
 * decisions: retry means "the parser may do better now", askAi means "I have
 * looked at this and I want a model's reading of it". The second one costs
 * money and the first does not, and a name that says which is which is worth
 * the extra enum member.
 */
/*
 * `stage` is `publish` that stops one step short.
 *
 * Both take the capture out of the inbox and make a recipe of it; they differ
 * in whether the recipe counts yet. `stage` leaves it a draft — findable at
 * /drafts, nowhere else — for the case the inbox was never good at: a recipe
 * worth keeping that nobody here has cooked, where the honest state is neither
 * "still a raw capture" nor "one of ours".
 *
 * Both are kept, because sometimes you already know. A recipe you have cooked
 * for years and are only typing up does not need a probation period, and
 * making it serve one would teach people to press past the draft state without
 * reading it.
 */
const actionSchema = z.object({ action: z.enum(['retry', 'askAi', 'aiOnly', 'publish', 'stage']) });

function parseId(raw: string): number | null {
    return positiveIntId(raw);
}

/**
 * A slug nobody has taken yet.
 *
 * Publishing from the inbox is meant to be one click, so a clash cannot be
 * allowed to stop it and ask a question. The same dish arriving twice is a
 * thing that happens — two people send you the same video — and getting
 * "-2" is a far better outcome than an error in a queue.
 */
const freeSlug = freeRecipeSlug;

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

    /*
     * `aiOnly`: the model reads everything the share carries — page text,
     * caption, description, subtitles, the screenshot — and its answer is the
     * draft. No rules, no learned layout, no merging: for when the rules found
     * something plausible and wrong. A person pressed it, so it may cost.
     */
    if (parsed.data.action === 'aiOnly') {
        const ai = await aiCapability();
        if (!canUseAi(ai)) {
            return NextResponse.json({ message: 'The AI is switched off or has no key.' }, { status: 501 });
        }
        const usage = usageRecorder('aiOnly', { captureId, source: capture.source });
        const result = await readWithAiOnly(capture, ai, { onModel: usage.report });
        await usage.flush();
        const updated = await prisma.capture.update({
            where: { id: captureId },
            // Nothing came back: the row keeps its draft and how it was read,
            // and only says why this attempt failed.
            data: result.draft
                ? {
                    status: result.status,
                    error: result.error,
                    readBy: result.readBy,
                    aiProvider: result.provider,
                    draft: toJsonObject(result.draft),
                    processedAt: new Date(),
                }
                : { error: result.error },
        });
        await syncWorkItem('capture', captureId);
        return NextResponse.json({ capture: updated });
    }

    if (parsed.data.action === 'retry' || parsed.data.action === 'askAi') {
        // `retry`: the same capture, read again — worth pressing after a key
        // has been pasted in, or after the parser has improved.
        //
        // `askAi`: the same, except that the quality gate is skipped. The
        // scoring is a guess about whether asking would help; somebody looking
        // at the draft knows better, and the scoring exists to save them the
        // trouble rather than to overrule them.
        const ai = await aiCapability();
        const usage = usageRecorder(parsed.data.action, { captureId, source: capture.source });
        const learning = usageRecorder('learn', { captureId, source: capture.source });
        const result = await processCapture(capture, ai, {
            force: parsed.data.action === 'askAi',
            onModel: usage.report,
            onLearn: learning.report,
            ...siteLearning(ai),
        });
        await Promise.all([usage.flush(), learning.flush()]);
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
        // Read better this time → closed on the work list; worse → added.
        await syncWorkItem('capture', captureId);
        return NextResponse.json({ capture: updated });
    }

    const draft = draftFromJson(capture.draft);

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

    try {
        // A retry or a model can leave a foreign picture in the draft, and
        // next/image only shows our own store. Ours stays as it is.
        const picture = draft.imageUrl ? await mirrorImageToBlob(draft.imageUrl) : '';
        const recipe = await prisma.recipe.create({
            data: newRecipeData({
                isDraft: parsed.data.action === 'stage',
                title: draft.title.trim(),
                slug: await freeSlug(draft.title),
                description: draft.description || null,
                category: draft.category || null,
                nationality: draft.nationality || null,
                instructions: draft.instructions,
                servings: draft.servings,
                prepMinutes: draft.prepMinutes,
                cookMinutes: draft.cookMinutes,
                ingredients: toStructuredIngredients(draft.ingredients),
                imageUrls: picture ? [picture] : [],
            }),
            select: { id: true, slug: true, title: true },
        });
        await releaseCaptureScreenshots(captureId, picture ? [picture] : []).catch(() => undefined);

        await prisma.capture.update({
            where: { id: captureId },
            data: { recipeId: recipe.id, error: null },
        });
        await syncWorkItem('capture', captureId);

        // Publishing a capture is a recipe appearing, with a category the
        // filter rail has never seen. See lib/collectionFacets.
        //
        // A draft is not: the chips count only what the list shows, and the
        // list does not show drafts. The cache is dropped anyway rather than
        // reasoned about — it is rebuilt on the next request, and a stale chip
        // count is a worse bug than a wasted query.
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

        failed('Publishing a capture failed:', error);
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
    const doomed: { imageUrl: string | null; moreImageUrls: string[]; status: string } | null =
        await prisma.capture.findUnique({
            where: { id: captureId },
            select: { imageUrl: true, moreImageUrls: true, status: true },
        });

    const removed = await prisma.capture.deleteMany({ where: { id: captureId } });
    await syncWorkItem('capture', captureId);

    if (removed.count === 1 && doomed && doomed.status !== 'published') {
        const files = [doomed.imageUrl, ...doomed.moreImageUrls].filter((url): url is string => Boolean(url));
        if (files.length > 0) await deleteBlobs(files);
    }

    return NextResponse.json({ ok: true });
}
