import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { mirrorImageToBlob } from '@/lib/mirrorImage';
import { aiCapability, rememberModel } from '@/lib/aiConfig';
import { classifyCapture } from '@/lib/capture';
import { processCapture } from '@/lib/captureProcess';
import { siteLearning } from '@/lib/siteProfileDb';
import { failed } from '@/lib/reportServerError';

const importSchema = z.object({
    url: z.string().trim().min(1).max(2048),
    /**
     * "Read this with the AI whatever the rules made of it."
     *
     * Skips the quality gate and loosens the mode gate from `assistsText` to
     * `canUseAi`, for the same reason the inbox button does: the gate is about
     * what happens automatically, and a person pressing a button is not that.
     * "Nie" still refuses.
     */
    force: z.boolean().optional(),
});


export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    /*
     * The shared limiter, because this route spends money.
     *
     * It used the in-memory one, whose own comment says it multiplies by the
     * number of warm instances and resets on every cold start — fine for a
     * view counter, and the wrong tool for a route where each call past the
     * limit is a charge at a provider. The database-backed count is the only
     * one that is actually a ceiling.
     */
    const limit = await rateLimitShared(clientKey(req, 'import-url'), 30, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many imports. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = importSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Please provide a URL.' }, { status: 400 });
    }

    /*
     * The same reading the inbox does, not a second copy of it.
     *
     * This route used to have its own: rules, then a model when the rules fell
     * short. The inbox had grown past it — site profiles, captions, YouTube
     * descriptions, a score that decides whether asking would help — and a
     * link pasted into the recipe form went to the model every time, even for
     * a site the cookbook had already learned.
     *
     * `processCapture` fetches through `fetchPage`, so the SSRF guard that was
     * the point of this route's last rewrite is still the only way out.
     */
    const classified = classifyCapture({ url: parsed.data.url });
    if (!classified) {
        return NextResponse.json({ message: 'Please provide a URL.' }, { status: 400 });
    }

    try {
        const ai = await aiCapability();
        const result = await processCapture(classified, ai, {
            force: parsed.data.force === true,
            onModel: (provider, model) => void rememberModel(provider, model),
            ...siteLearning(ai),
        });

        const recipe = result.draft;
        if (!recipe || (!recipe.title && recipe.ingredients.length === 0)) {
            return NextResponse.json(
                {
                    message:
                        result.status === 'failed' && result.error
                            ? result.error
                            : 'No recipe data found on that page. Try copying the recipe text and pasting it instead.',
                },
                { status: 422 }
            );
        }

        // Foreign image hosts are not allowed by next/image, so copy the picture
        // into our own Blob store rather than handing back a URL that will fail
        // to render on the recipe page.
        const imageUrl = recipe.imageUrl ? await mirrorImageToBlob(recipe.imageUrl) : '';

        return NextResponse.json({
            recipe: { ...recipe, imageUrl },
            // Tell the UI how much it actually got, so it can be honest about it.
            partial: recipe.ingredients.length === 0 || !recipe.instructions,
            usedAi: result.provider !== null && result.readBy !== 'rules+ai-failed',
            readBy: result.readBy,
        });
    } catch (error) {
        failed('URL import error:', error);
        return NextResponse.json({ message: 'The page could not be read.' }, { status: 502 });
    }
}
