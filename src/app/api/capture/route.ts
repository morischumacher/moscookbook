import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { classifyCapture, tokenFromHeader, hashCaptureToken } from '@/lib/capture';
import { processCapture } from '@/lib/captureProcess';
import { mirrorImageToBlob } from '@/lib/mirrorImage';

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
});

const MAX_BODY_BYTES = 1024 * 1024;

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

    const classified = classifyCapture(parsed.data);
    if (!classified) {
        return NextResponse.json({ message: 'Nothing usable was sent.' }, { status: 400 });
    }

    // Step one: make it durable. Everything after this point may fail without
    // losing what was shared.
    const capture = await prisma.capture.create({
        data: {
            kind: classified.kind,
            source: classified.source,
            sourceUrl: classified.sourceUrl,
            rawText: classified.rawText,
            note: classified.note,
            status: 'new',
        },
        select: { id: true },
    });

    await prisma.captureToken.update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
    });

    // Step two: try to read it, here and now, so that the common case is
    // already sorted by the time the inbox is next opened. A failure is
    // recorded on the capture, not returned as an error — the capture itself
    // succeeded.
    const result = await processCapture(classified);

    // Foreign image hosts are rejected by next/image, so the picture is copied
    // into our own store rather than kept as a link that will not render.
    const draft =
        result.draft && result.draft.imageUrl
            ? { ...result.draft, imageUrl: await mirrorImageToBlob(result.draft.imageUrl) }
            : result.draft;

    await prisma.capture.update({
        where: { id: capture.id },
        data: {
            status: result.status,
            error: result.error,
            draft: draft ?? undefined,
            imageUrl: draft?.imageUrl || null,
            processedAt: new Date(),
        },
    });

    return NextResponse.json(
        {
            id: capture.id,
            status: result.status,
            title: draft?.title ?? '',
            // No prose here: this answer is read by a Shortcut, which has no
            // locale to pick from. The Shortcut builds its own notification
            // out of `status` and `title`.
        },
        { status: 201 }
    );
}

/** The inbox list, for the admin screen. */
export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const captures = await prisma.capture.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
    });

    return NextResponse.json({ captures });
}
