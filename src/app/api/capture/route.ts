import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { deleteBlobs } from '@/lib/blobCleanup';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { tokenFromHeader, hashCaptureToken } from '@/lib/capture';
import { captureInputFrom } from '@/lib/captureInput';
import { storeCaptureImage, MAX_CAPTURE_IMAGE_BASE64 } from '@/lib/storeCaptureImage';
import { findDuplicate, type ExistingRecipe } from '@/lib/duplicates';
import { processCapture } from '@/lib/captureProcess';
import { siteLearning } from '@/lib/siteProfileDb';
import { aiCapability, rememberModel } from '@/lib/aiConfig';
import { DEFAULT_MODEL, canUseAi } from '@/lib/aiImport';
import { mirrorImageToBlob } from '@/lib/mirrorImage';
import { toJsonObject } from '@/lib/json';
import { failed } from '@/lib/reportServerError';
import { draftFromJson } from '@/lib/captureDraft';

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
 *   - It answers as soon as the capture is safe, and reads it afterwards.
 *
 * The third of those was a comment rather than a behaviour for a year. The
 * code awaited the whole pipeline before answering, so a share waited for the
 * page to be fetched, the rules to run and — since the AI arrived — a model to
 * think. Measured against real pages this afternoon: 2.8 s for a YouTube
 * video, 7.1 s for a Chefkoch article, **15.0 s** for a Squarespace recipe.
 * Fifteen seconds is a person standing in a supermarket wondering whether the
 * share worked, with a spinner that this file's own documentation says was the
 * thing being fixed.
 *
 * `after()` runs the reading once the response has been sent. The capture is
 * already durable by then — that is the whole point of writing it first — so
 * nothing is at risk, and the inbox gets the draft a few seconds later whether
 * or not anybody is still looking at the phone.
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
    const limit = await rateLimitShared(clientKey(req, 'capture'), 60, 10 * 60 * 1000);
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

        failed('Capture could not be stored:', error);
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

    /*
     * Step two: read it — after the answer has gone.
     *
     * Everything below runs once the phone has its 201 and the share sheet has
     * closed. The row exists, the picture is stored, nothing here can lose
     * either; the worst case is a capture that sits in the inbox as `new` for
     * a few seconds longer, which is what the inbox's own retry is for.
     *
     * A failure is recorded on the capture rather than returned, because there
     * is nobody left to return it to — and that was already true before this
     * moved, since a site that will not load must never turn a capture that
     * *was* saved into a 500 saying it was not.
     */
    after(async () => {
        try {
            // Read here rather than inside the pipeline: `captureProcess` must
            // not import Prisma, because the test suite imports `captureProcess`.
            // With the stored address put back on it.
            //
            // The second half of the same bug: classification happens before the
            // upload, so `classified.imageUrl` is null for a screenshot, and
            // handing that to the pipeline made it answer "No picture was stored"
            // about a picture that had just been stored perfectly.
            const ai = await aiCapability();
            const result = await processCapture(
                { ...classified, imageUrl: imageUrl ?? classified.imageUrl },
                ai,
                {
                    onModel: (provider, model) => void rememberModel(provider, model),
                    ...siteLearning(ai),
                }
            );

            // Foreign image hosts are rejected by next/image, so the picture is
            // copied into our own store rather than kept as a link that will not
            // render.
            const draft =
                result.draft && result.draft.imageUrl
                    ? { ...result.draft, imageUrl: await mirrorImageToBlob(result.draft.imageUrl) }
                    : result.draft;

            await prisma.capture.update({
                where: { id: capture.id },
                data: {
                    status: result.status,
                    error: result.error,
                    readBy: result.readBy,
                    aiProvider: result.provider,
                    // Widened before storing: see src/lib/json.ts, and
                    // tests/prismaJsonCompat.ts for why the compiler insists.
                    draft: draft ? toJsonObject(draft) : undefined,
                    imageUrl: draft?.imageUrl || imageUrl || null,
                    processedAt: new Date(),
                },
            });
        } catch (error) {
            failed('Capture was saved but could not be read:', error);

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
    });

    return NextResponse.json(
        {
            id: capture.id,
            /*
             * `queued`, not the parsed status — because at this instant the
             * parsing has not happened, and the alternative is answering with
             * a guess.
             *
             * The Shortcut shows this, so it is a word somebody reads while
             * standing in a shop: it says the thing arrived, which is the only
             * question they have. What it turned into is a question for the
             * inbox, later, on a bigger screen.
             */
            status: 'queued',
            // No prose here: this answer is read by a Shortcut, which has no
            // locale to pick from.
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

        const draft = draftFromJson(capture.draft);
        const title = draft?.title ?? '';

        return {
            ...capture,
            duplicateOf: findDuplicate(title, capture.sourceUrl, recipes, publishedUrls),
        };
    });

    /*
     * Reported with the list rather than fetched separately, because the
     * inbox needs it for every row and one extra field on a response it was
     * already making is cheaper than a second request that can fail on its
     * own and leave the buttons in a state nobody chose.
     */
    /*
     * And *which* model would be asked, so the inbox can say so while it
     * waits. Waiting on a provider is a different kind of wait from waiting
     * on our own database — seconds rather than milliseconds, it costs money,
     * and it can come back with nothing — and naming the model is how the
     * person watching knows which of those they are in.
     *
     * The first key is the one that would be tried; the others are its
     * fallbacks. Its own model when one is set, otherwise that provider's
     * default. No key material leaves here, only the name of a model.
     */
    const ai = await aiCapability();
    const next = ai.keys[0] ?? null;

    return NextResponse.json({
        captures: withHints,
        aiAvailable: canUseAi(ai),
        aiModel: next ? next.model?.trim() || DEFAULT_MODEL[next.provider] : null,
    });
}
