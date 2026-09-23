import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { canUseAi, completeWithKey, extractJson } from '@/lib/aiImport';
import { aiCapability } from '@/lib/aiConfig';
import { translateRecipe, translateRequestSchema } from '@/lib/recipeTranslation';
import { usageRecorder } from '@/lib/tokenUsageDb';

/**
 * "Translate this recipe", from the recipe form.
 *
 * Gated like the proof-reader (see api/ai/polish): an admin pressing a button
 * on a recipe they are editing, with the AI switched on. Nothing is written
 * here — the translation goes back to the form, where it can be read and
 * corrected, and is saved with the recipe.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const ai = await aiCapability();

    if (!canUseAi(ai)) {
        return NextResponse.json({ message: 'The AI is switched off or has no key.' }, { status: 501 });
    }

    // One press is one recipe; thirty in ten minutes is a lot of cooking.
    const limit = await rateLimitShared(clientKey(req, 'ai-translate'), 30, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many translations. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = translateRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
    }

    const { from, ...recipe } = parsed.data;

    const usage = usageRecorder('translate');
    const outcome = await translateRecipe(
        recipe,
        from,
        ai.keys,
        (key, system, text) => completeWithKey(key, { kind: 'raw', system, text }, usage.report),
        extractJson
    );
    await usage.flush();

    if (!outcome.ok) {
        // An answer that did not match the recipe is an answer, not a fault:
        // the screen has a sentence for it.
        if (outcome.reason === 'unusable') return NextResponse.json({ ok: false, reason: outcome.reason });
        return NextResponse.json({ message: outcome.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, translation: outcome.translation });
}
