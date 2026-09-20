import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { isAiImportConfigured, extractRecipeWithAi } from '@/lib/aiImport';
import { parseRecipeText } from '@/lib/recipeParser';

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

    if (!isAiImportConfigured()) {
        return NextResponse.json(
            { message: 'AI import is not configured on this deployment.' },
            { status: 501 }
        );
    }

    // Each call costs money, so keep a lid on it.
    const limit = rateLimit(clientKey(req, 'import-ai'), 20, 10 * 60 * 1000);
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

    try {
        const recipe = await extractRecipeWithAi(parsed.data);
        return NextResponse.json({ recipe, source: 'ai' });
    } catch (error) {
        console.error('AI import error:', error);

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
