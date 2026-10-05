import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { canUseAi } from '@/lib/aiImport';
import { aiCapability } from '@/lib/aiConfig';
import { canPaint, generatePicture, picturePrompt } from '@/lib/aiPicture';
import { usageRecorder } from '@/lib/tokenUsageDb';
import { blobName } from '@/lib/blobName';
import { CONTENT_TYPE_OF, imageTypeOf } from '@/lib/uploadImage';
import { failed } from '@/lib/reportServerError';

/** Painting takes a while: thirty seconds is ordinary, and the limit on every plan is sixty. */
export const maxDuration = 60;

const body = z.object({
    title: z.string().trim().min(1).max(200),
    ingredients: z.array(z.string().max(300)).max(100).default([]),
});

/**
 * "Bild mit KI erzeugen", from the recipe form (work #32).
 *
 * Gated like the proof-reader (see api/ai/polish): an admin pressing a button
 * on a recipe they are editing, with the AI switched on. The picture is
 * stored like an upload and its address handed back to the form, which adds
 * it to the gallery — nothing is saved to the recipe until the form is.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const ai = await aiCapability();
    if (!canUseAi(ai)) {
        return NextResponse.json({ message: 'The AI is switched off or has no key.' }, { status: 501 });
    }
    if (!canPaint(ai.keys)) {
        return NextResponse.json({ message: 'Pictures need an OpenAI or Google key.' }, { status: 501 });
    }

    // The dearest button in the cookbook: a few cents a press.
    const limit = await rateLimitShared(clientKey(req, 'ai-picture'), 10, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many pictures. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
    }

    const usage = usageRecorder('picture');
    const outcome = await generatePicture(ai.keys, picturePrompt(parsed.data.title, parsed.data.ingredients), fetch, usage.report);
    await usage.flush();

    if (!outcome.ok) {
        if (outcome.reason === 'no-keys') return NextResponse.json({ message: outcome.message }, { status: 501 });
        return NextResponse.json({ message: outcome.message }, { status: 502 });
    }

    // Stored by what the bytes are, not by what the provider said they are.
    const buffer = Buffer.from(outcome.bytes);
    const type = imageTypeOf(buffer);
    if (!type) {
        return NextResponse.json({ message: 'The AI did not send back a picture.' }, { status: 502 });
    }

    try {
        const extension = type === 'jpeg' ? 'jpg' : type;
        const blob = await put(blobName('picture', `ai.${extension}`, parsed.data.title), buffer, {
            access: 'public',
            contentType: CONTENT_TYPE_OF[type],
        });
        return NextResponse.json({ url: blob.url });
    } catch (error) {
        failed('AI picture upload error:', error);
        return NextResponse.json({ message: 'Upload failed' }, { status: 500 });
    }
}
