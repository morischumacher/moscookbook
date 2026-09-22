import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { canSeal } from '@/lib/secretBox';
import { isAiProvider, isAssistMode, isValidModel, ASSIST_MODES } from '@/lib/aiImport';
import {
    assistMode,
    listAiCredentials,
    saveAiCredential,
    setAssistMode,
    setPrimary,
    type AiCredentialView,
} from '@/lib/aiConfig';

/**
 * The AI keys, as the admin screen sees them.
 *
 * **Nothing here ever returns a key.** Not masked, not partially, not "just
 * for the edit form" — the screen never needs one, because a key is written
 * and then only ever replaced. `listAiCredentials` is the only reader and it
 * returns a view type with no secret in it; `scripts/check-secrets.mjs` fails
 * the build if a second reader appears.
 *
 * That is worth being strict about. A masked key in a JSON response is still a
 * key in a JSON response as soon as somebody changes the masking, and a
 * write-only field is a field that cannot leak.
 */

const saveSchema = z.object({
    provider: z.string().refine(isAiProvider, 'Unknown provider'),
    /**
     * Absent means "leave the key alone"; present means replace it. There is no
     * way to spell "clear the key but keep the row" and there should not be —
     * that is what deleting the provider is.
     *
     * Trimmed, because a key pasted from a dashboard arrives with a newline on
     * it about half the time and a trailing newline in a header is a 401 with
     * no explanation.
     */
    apiKey: z.string().trim().min(8).max(500).optional(),
    model: z.string().trim().max(80).nullable().optional(),
    enabled: z.boolean().optional(),
    primary: z.boolean().optional(),
});

export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const [credentials, mode]: [AiCredentialView[], string] = await Promise.all([
        listAiCredentials(),
        assistMode(),
    ]);

    return NextResponse.json({
        credentials,
        mode,
        modes: ASSIST_MODES,
        /**
         * Whether this deployment can store a key at all. False means no
         * session secret, which means nothing here would survive being
         * written — the screen says that rather than accepting a paste and
         * silently losing it.
         */
        canStore: canSeal(),
    });
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = saveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
    }

    const { provider, apiKey, model, enabled, primary } = parsed.data;

    if (model && !isValidModel(model)) {
        return NextResponse.json(
            {
                message:
                    'That is not a usable model name — letters, digits, dots, colons and dashes only.',
            },
            { status: 400 }
        );
    }

    if (!canSeal() && apiKey !== undefined) {
        return NextResponse.json(
            { message: 'This deployment has no secret to store keys under.' },
            { status: 503 }
        );
    }

    const stored = await saveAiCredential({
        provider,
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
    });

    if (!stored) {
        return NextResponse.json({ message: 'The key could not be stored.' }, { status: 500 });
    }

    // After the row exists, so that making a brand-new provider primary in the
    // same request works rather than updating nothing.
    if (primary) await setPrimary(provider);

    return NextResponse.json({ credentials: await listAiCredentials() });
}

const modeSchema = z.object({
    mode: z.string().refine(isAssistMode, 'Unknown mode'),
});

/** The one knob: when the AI is allowed to be asked. */
export async function PATCH(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = modeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
    }

    await setAssistMode(parsed.data.mode);
    return NextResponse.json({ mode: parsed.data.mode });
}
