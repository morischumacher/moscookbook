import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireAdmin } from '@/lib/auth';
import { slugify } from '@/lib/recipe';
import { searchFields } from '@/lib/searchText';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { processCapture } from '@/lib/captureProcess';
import type { ImportedRecipe } from '@/lib/recipeFromHtml';
import { toJsonObject } from '@/lib/json';

const actionSchema = z.object({ action: z.enum(['retry', 'publish']) });

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

    if (parsed.data.action === 'retry') {
        const result = await processCapture(capture);
        const updated = await prisma.capture.update({
            where: { id: captureId },
            data: {
                status: result.status,
                error: result.error,
                draft: result.draft ? toJsonObject(result.draft) : undefined,
                processedAt: new Date(),
            },
        });
        return NextResponse.json({ capture: updated });
    }

    if (capture.status === 'published') {
        return NextResponse.json(
            { message: 'This capture has already become a recipe.' },
            { status: 409 }
        );
    }

    const draft = capture.draft as unknown as ImportedRecipe | null;

    if (!draft || !draft.title.trim() || !draft.instructions.trim()) {
        return NextResponse.json(
            { message: 'This capture has no complete recipe yet. Open it and finish it first.' },
            { status: 422 }
        );
    }

    const ingredientRows = toStructuredIngredients(draft.ingredients);

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
        data: { status: 'published', recipeId: recipe.id, error: null },
    });

    return NextResponse.json({ recipe }, { status: 201 });
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
