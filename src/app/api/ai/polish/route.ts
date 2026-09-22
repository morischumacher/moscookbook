import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimit } from '@/lib/rateLimit';
import { canUseAi, completeWithKey } from '@/lib/aiImport';
import { aiCapability } from '@/lib/aiConfig';
import { polish, polishSchema } from '@/lib/aiPolish';

/**
 * "Fix my spelling" and "turn this into steps".
 *
 * Gated on the AI being switched on at all (`canUseAi`) rather than on the
 * text-assist setting, and the distinction is deliberate. "Nur Bilder" is a
 * rule about what happens **automatically**, on an import nobody is watching,
 * where the cost is unpredictable and the trigger is a share from a phone.
 * This is a person looking at a screen and pressing a button on their own
 * text. "Nie" still means never — that is what "nie" is for.
 *
 * Nothing here writes anything. The answer goes back to the browser, which
 * shows it next to the original, and a second deliberate press applies it.
 */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const ai = await aiCapability();

    if (!canUseAi(ai)) {
        return NextResponse.json(
            { message: 'The AI is switched off or has no key.' },
            { status: 501 }
        );
    }

    // Each press costs money. Sixty in ten minutes is more than anybody edits.
    const limit = rateLimit(clientKey(req, 'ai-polish'), 60, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many revisions. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = polishSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
    }

    const outcome = await polish(parsed.data.mode, parsed.data.text, ai.keys, (key, system, text) =>
        completeWithKey(key, { kind: 'raw', system, text })
    );

    if (!outcome.ok) {
        // 200 with ok:false for the two outcomes that are answers rather than
        // faults — a model that changed a number did its job and was refused,
        // and the screen has a sentence for that.
        if (outcome.reason === 'numbers-changed') {
            return NextResponse.json({ ok: false, reason: outcome.reason });
        }

        return NextResponse.json({ message: outcome.message }, { status: 502 });
    }

    return NextResponse.json({
        ok: true,
        text: outcome.text,
        unchanged: outcome.unchanged,
        provider: ai.keys[0]?.provider ?? null,
    });
}
