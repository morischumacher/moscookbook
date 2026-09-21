import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireAdmin } from '@/lib/auth';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { tokenFromHeader, hashCaptureToken } from '@/lib/capture';
import { captureInputFrom } from '@/lib/captureInput';
import { storeCaptureImage, MAX_CAPTURE_IMAGE_BASE64 } from '@/lib/storeCaptureImage';
import { findDuplicate, type ExistingRecipe } from '@/lib/duplicates';
import { processCapture } from '@/lib/captureProcess';
import { mirrorImageToBlob } from '@/lib/mirrorImage';
import { toJsonObject } from '@/lib/json';

/**
 * The capture endpoint.
 *
 * This is what an iOS Shortcut posts to from a share sheet, so it is the one
 * place in the application that can be written to without a session. Three
 * things follow from that, and all three matter:
 *
 *   - It authenticates with a long random token, compared in constant time
 *     against a stored hash.
 *   - It writes the raw capture *before* trying to parse it. A share made in a
 *     supermarket must not be lost because a recipe site was slow.
 *   - It answers as soon as the capture is safe, even if parsing then fails.
 *     Standing in a shop waiting for a spinner is the thing being fixed here.
 */

const captureSchema = z.object({
    url: z.string().trim().max(2048).optional(),
    text: z.string().max(200_000).optional(),
    note: z.string().trim().max(500).optional(),
    /** Set by the mail bridge; the body then gets its furniture stripped. */
    via: z.enum(['email']).optional(),
    /** An e-mail's subject line. */
    subject: z.string().trim().max(500).optional(),

    /**
     * A screenshot. Base64 rather than multipart, because an iOS Shortcut can
     * do "Base64 Encode" in one block and cannot build a multipart body at all.
     */
    image: z
        .object({
            base64: z.string().min(1).max(MAX_CAPTURE_IMAGE_BASE64),
            mediaType: z.string().max(100),
        })
        .optional(),
});

// Base64 is a third bigger than the bytes it carries, and a phone screenshot
// is comfortably under five megabytes; ten leaves room for both.
const MAX_BODY_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
    const length = Number(req.headers.get('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) {
        return NextResponse.json({ message: 'That is too large to capture.' }, { status: 413 });
    }

    const token = tokenFromHeader(req.headers.get('authorization'));
    if (!token) {
        return NextResponse.json({ message: 'A capture token is required.' }, { status: 401 });
    }

    // Before the token is even looked up: an unauthenticated endpoint that
    // touches the database on every request is a way to run up a bill.
    const limit = rateLimit(clientKey(req, 'capture'), 60, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many captures. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    // Looked up by hash rather than compared one by one: the unique index does
    // the work, and there is no list of tokens to walk in variable time.
    const record: { id: number; revokedAt: Date | null } | null =
        await prisma.captureToken.findUnique({
            where: { tokenHash: hashCaptureToken(token) },
            select: { id: true, revokedAt: true },
        });

    if (!record || record.revokedAt !== null) {
        return NextResponse.json({ message: 'That capture token is not valid.' }, { status: 401 });
    }

    const parsed = captureSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Send a url, some text, or both.' }, { status: 400 });
    }

    /*
     * Order matters here, and it was the wrong way round.
     *
     * The picture used to be written to the Blob store first and the body
     * checked afterwards — so a capture with a screenshot and nothing else
     * usable answered 400 with the file already written and nothing in the
     * database pointing at it. The classifier needs no image to decide, so it
     * decides first and the file is only paid for once there is somewhere for
     * it to belong.
     */
    const classified = captureInputFrom(parsed.data);
    if (!classified) {
        return NextResponse.json({ message: 'Nothing usable was sent.' }, { status: 400 });
    }

    let imageUrl: string | undefined;

    if (parsed.data.image) {
        const stored = await storeCaptureImage(
            parsed.data.image.base64,
            parsed.data.image.mediaType
        );

        if (!stored.ok) {
            return NextResponse.json(
                { message: `The picture could not be stored (${stored.reason}).` },
                { status: 400 }
            );
        }

        imageUrl = stored.url;
    }

    // Step one: make it durable. Everything after this point may fail without
    // losing what was shared.
    let capture: { id: number };

    try {
        capture = await prisma.capture.create({
            data: {
                kind: classified.kind,
                source: classified.source,
                sourceUrl: classified.sourceUrl,
                rawText: classified.rawText,
                note: classified.note,
                imageUrl: imageUrl ?? classified.imageUrl,
                status: 'new',
            },
            select: { id: true },
        });
    } catch (error) {
        /*
         * This is the failure the comment above calls unforgivable, and until
         * now it was also unhandled: the screenshot was already in the store,
         * the row never appeared, and the Shortcut got an HTML 500 with no
         * reason in it. The file goes with the failure rather than being left
         * behind, and the answer says what happened.
         */
        if (imageUrl) await deleteBlobs([imageUrl]);

        console.error('Capture could not be stored:', error);
        return NextResponse.json(
            { message: 'The capture could not be saved. Nothing was kept — please send it again.' },
            { status: 500 }
        );
    }

    // updateMany, not update: a token revoked and deleted between the lookup
    // above and here threw P2025 and failed a capture that had already been
    // saved successfully. Whether the stamp lands is not worth that.
    await prisma.captureToken
        .updateMany({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);

    // Step two: try to read it, here and now, so that the common case is
    // already sorted by the time the inbox is next opened. A failure is
    // recorded on the capture, not returned as an error — the capture itself
    // succeeded.
    /*
     * Wrapped, because the row already exists and the person has already been
     * told nothing by then. A site that will not load, an image host that
     * hangs, a page that parses into something unexpected — none of those may
     * turn a capture that *was* saved into a 500 that says it was not. The
     * failure is recorded on the capture, which is what the inbox's "retry" is
     * for.
     */
    let status = 'failed';
    let title = '';

    try {
        const result = await processCapture(classified);

        // Foreign image hosts are rejected by next/image, so the picture is
        // copied into our own store rather than kept as a link that will not
        // render.
        const draft =
            result.draft && result.draft.imageUrl
                ? { ...result.draft, imageUrl: await mirrorImageToBlob(result.draft.imageUrl) }
                : result.draft;

        status = result.status;
        title = draft?.title ?? '';

        await prisma.capture.update({
            where: { id: capture.id },
            data: {
                status: result.status,
                error: result.error,
                // Widened before storing: see src/lib/json.ts, and
                // tests/prismaJsonCompat.ts for why the compiler insists.
                draft: draft ? toJsonObject(draft) : undefined,
                imageUrl: draft?.imageUrl || imageUrl || null,
                processedAt: new Date(),
            },
        });
    } catch (error) {
        console.error('Capture was saved but could not be read:', error);

        await prisma.capture
            .updateMany({
                where: { id: capture.id },
                data: {
                    status: 'failed',
                    error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
                    processedAt: new Date(),
                },
            })
            .catch(() => undefined);
    }

    return NextResponse.json(
        {
            id: capture.id,
            status,
            title,
            // No prose here: this answer is read by a Shortcut, which has no
            // locale to pick from. The Shortcut builds its own notification
            // out of `status` and `title`.
        },
        { status: 201 }
    );
}

interface CaptureRow {
    id: number;
    status: string;
    sourceUrl: string | null;
    recipeId: number | null;
    draft: unknown;
}

/**
 * The inbox list, for the admin screen.
 *
 * Duplicate hints are worked out here rather than stored on the capture: what
 * counts as a duplicate depends on what the cookbook holds *now*, and a hint
 * written at capture time would go stale the moment a recipe is published or
 * deleted.
 */
export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    // Annotated rather than inferred: without a generated Prisma client these
    // come back as `any`, and an inbox row silently losing its type is how a
    // duplicate hint ends up attached to the wrong capture.
    const [captures, recipes]: [CaptureRow[], ExistingRecipe[]] = await Promise.all([
        prisma.capture.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
        // The whole list of titles, which for a personal cookbook is a few
        // kilobytes — cheaper than a query per row in the inbox.
        prisma.recipe.findMany({ select: { id: true, title: true, slug: true } }) as Promise<
            ExistingRecipe[]
        >,
    ]);

    // Links that already became a recipe. This is the certain signal: the same
    // video sent twice is the same video.
    const publishedUrls = new Map<string, ExistingRecipe>();
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

    for (const capture of captures) {
        if (capture.status !== 'published' || !capture.sourceUrl || capture.recipeId === null) {
            continue;
        }
        const recipe = byId.get(capture.recipeId);
        if (recipe) publishedUrls.set(capture.sourceUrl, recipe);
    }

    const withHints = captures.map((capture) => {
        if (capture.status === 'published') return { ...capture, duplicateOf: null };

        const draft = capture.draft as { title?: string } | null;
        const title = draft?.title ?? '';

        return {
            ...capture,
            duplicateOf: findDuplicate(title, capture.sourceUrl, recipes, publishedUrls),
        };
    });

    return NextResponse.json({ captures: withHints });
}
