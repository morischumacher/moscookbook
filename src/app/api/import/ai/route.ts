import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { assistsText, canUseAi, extractRecipeWithAi } from '@/lib/aiImport';
import { aiCapability, rememberModel } from '@/lib/aiConfig';
import { parseRecipeText } from '@/lib/recipeParser';
import { failed } from '@/lib/reportServerError';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BASE64 = 7 * 1024 * 1024; // roughly 5 MB of binary

const aiImportSchema = z.union([
    z.object({
        kind: z.literal('text'),
        text: z.string().trim().min(1).max(30_000),
    }),
    z.object({
        kind: z.literal('image'),
        base64: z.string().min(1).max(MAX_IMAGE_BASE64),
        mediaType: z.string().refine((value) => ALLOWED_IMAGE_TYPES.has(value), 'Unsupported image type'),
    }),
]);

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const ai = await aiCapability();

    if (!canUseAi(ai)) {
        return NextResponse.json(
            { message: 'AI import is not configured on this deployment.' },
            { status: 501 }
        );
    }

    // Each call costs money, so keep a lid on it.
    /*
     * The shared limiter, because this route spends money.
     *
     * It used the in-memory one, whose own comment says it multiplies by the
     * number of warm instances and resets on every cold start — fine for a
     * view counter, and the wrong tool for a route where each call past the
     * limit is a charge at a provider. The database-backed count is the only
     * one that is actually a ceiling.
     */
    const limit = await rateLimitShared(clientKey(req, 'import-ai'), 20, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many AI imports. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = aiImportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
    }

    /*
     * Pasted text is held to the stricter setting, and a picture is not.
     *
     * They are different questions. "Read this photograph" has no rule-based
     * answer at all, so refusing it means refusing the feature. "Read this text
     * I pasted" does — the parser is right there, one tab across — so it obeys
     * the setting that says whether the AI may be asked for things the rules
     * could also attempt.
     */
    if (parsed.data.kind === 'text' && !assistsText(ai)) {
        const fallback = parseRecipeText(parsed.data.text);
        return NextResponse.json({
            recipe: {
                ...fallback,
                category: '',
                nationality: '',
                servings: null,
                prepMinutes: null,
                cookMinutes: null,
            },
            source: 'fallback',
            message: 'The AI is set to pictures only, so the text was parsed locally.',
        });
    }

    try {
        const recipe = await extractRecipeWithAi(parsed.data, ai.keys, (provider, model) =>
            void rememberModel(provider, model)
        );
        return NextResponse.json({ recipe, source: 'ai' });
    } catch (error) {
        failed('AI import error:', error);

        // Never leave the user stranded: for text input the rule-based parser
        // is a perfectly good answer, so fall back to it instead of failing.
        if (parsed.data.kind === 'text') {
            const fallback = parseRecipeText(parsed.data.text);
            return NextResponse.json({
                recipe: {
                    ...fallback,
                    category: '',
                    nationality: '',
                    servings: null,
                    prepMinutes: null,
                    cookMinutes: null,
                },
                source: 'fallback',
                message: 'AI import was unavailable, so the text was parsed locally.',
            });
        }

        return NextResponse.json(
            { message: 'The image could not be read. Please type the recipe in instead.' },
            { status: 502 }
        );
    }
}
