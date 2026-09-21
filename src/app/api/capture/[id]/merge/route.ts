import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

const bodySchema = z.object({ recipeId: z.number().int().positive() });

/**
 * "This is the same dish I already have."
 *
 * The inbox has always been able to spot a duplicate — the same video sent
 * twice, a recipe someone else shared last month — and then offered nothing to
 * do about it but discard the capture, which throws away whatever came with it,
 * or publish it, which leaves two copies of one recipe.
 *
 * Merging is the third answer, and it is deliberately the conservative one:
 *
 *   - the existing recipe's words are **never** touched. A capture is a guess
 *     made by a parser; the recipe is something a person wrote. A merge that
 *     overwrote it would be the same "second disaster" the archive restore
 *     refuses to be.
 *   - a picture the recipe does not have is added to its gallery, because that
 *     is the thing a second capture of the same dish usually brings.
 *   - the capture is filed against the recipe and marked published, so it
 *     leaves the inbox with a record of where it went rather than vanishing.
 *
 * What it does not do is decide anything. If the new version is better, the
 * editor is one click away and takes a minute.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const captureId = Number.parseInt(id, 10);
    if (Number.isNaN(captureId)) {
        return NextResponse.json({ message: 'Invalid capture ID' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Which recipe?' }, { status: 400 });
    }

    try {
        const capture: {
            id: number;
            imageUrl: string | null;
            draft: unknown;
            status: string;
        } | null = await prisma.capture.findUnique({
            where: { id: captureId },
            select: { id: true, imageUrl: true, draft: true, status: true },
        });

        if (!capture) {
            return NextResponse.json({ message: 'Capture not found' }, { status: 404 });
        }

        if (capture.status === 'published') {
            return NextResponse.json(
                { message: 'That capture has already been dealt with.' },
                { status: 409 }
            );
        }

        const recipe: { id: number; images: { url: string }[] } | null =
            await prisma.recipe.findUnique({
                where: { id: parsed.data.recipeId },
                select: { id: true, images: { select: { url: true } } },
            });

        if (!recipe) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        // The picture may be on the capture itself or inside the draft the
        // parser produced; either counts, and neither is guaranteed.
        const draftImage =
            capture.draft && typeof capture.draft === 'object'
                ? (capture.draft as { imageUrl?: unknown }).imageUrl
                : null;

        const candidates = [capture.imageUrl, typeof draftImage === 'string' ? draftImage : null]
            .filter((url): url is string => Boolean(url));

        const known = new Set(recipe.images.map((image) => image.url));
        const fresh = [...new Set(candidates)].filter((url) => !known.has(url));

        if (fresh.length > 0) {
            // Appended, not inserted: the recipe's own first photograph stays
            // its first photograph, which is the one every list shows.
            const next = recipe.images.length;
            await prisma.image.createMany({
                data: fresh.map((url, index) => ({
                    recipeId: recipe.id,
                    url,
                    position: next + index,
                })),
            });
        }

        await prisma.capture.update({
            where: { id: capture.id },
            data: {
                status: 'published',
                recipeId: recipe.id,
                error: null,
                processedAt: new Date(),
            },
        });

        return NextResponse.json({ success: true, imagesAdded: fresh.length });
    } catch (error) {
        console.error('Capture merge failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
