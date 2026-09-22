import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimit } from '@/lib/rateLimit';
import { extractWithKey, isAiProvider, PROVIDER_LABEL } from '@/lib/aiImport';
import { keyFor, listAiCredentials, recordCheck } from '@/lib/aiConfig';
import { scrub } from '@/lib/secretBox';

/**
 * Asks a provider whether the key works, by giving it something to do.
 *
 * Not a ping and not a `/models` call. The question worth answering is not
 * "does this key authenticate" but "will this key import a recipe", and those
 * differ in the three ways that actually happen: a key with no credit left, a
 * model name that no longer exists, and an account without access to the model
 * it is being asked for. All three authenticate perfectly and all three fail
 * the moment a recipe is shared.
 *
 * So the test is the smallest real job: four lines of recipe, extracted. It
 * costs a fraction of a cent and it is the same code path an import takes.
 */

/**
 * Deliberately trivial, deliberately German, deliberately complete.
 *
 * Complete so that an empty answer means something is wrong rather than
 * meaning the text was ambiguous. German because this cookbook is, and because
 * a model that quietly translates is a model worth knowing about before it
 * starts translating somebody's grandmother's recipes.
 */
const PROBE = `Bratkartoffeln

Zutaten:
500 g Kartoffeln
2 EL Butterschmalz
1 Zwiebel
Salz

Zubereitung:
Kartoffeln kochen, abkühlen lassen und in Scheiben schneiden.
In Butterschmalz goldbraun braten, Zwiebel zugeben, salzen.`;

export async function POST(req: NextRequest, context: { params: Promise<{ provider: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { provider } = await context.params;

    if (!isAiProvider(provider)) {
        return NextResponse.json({ message: 'Unknown provider.' }, { status: 404 });
    }

    // Each press costs money at somebody's provider. Twenty in ten minutes is
    // more than anybody needs to convince themselves a key works.
    const limit = rateLimit(clientKey(req, 'ai-test'), 20, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many tests. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const key = await keyFor(provider);

    if (!key) {
        return NextResponse.json(
            { message: `No usable key is stored for ${PROVIDER_LABEL[provider]}.` },
            { status: 400 }
        );
    }

    try {
        const recipe = await extractWithKey(key, { kind: 'text', text: PROBE });

        if (!recipe.title.trim() || recipe.ingredients.length === 0) {
            // It answered, and the answer was empty. Almost always a model
            // that returns prose rather than JSON — which is a real failure
            // for this purpose and has to be reported as one.
            const message = 'The key works, but the model did not return a usable recipe.';
            await recordCheck(provider, message);
            return NextResponse.json({
                ok: false,
                message,
                credentials: await listAiCredentials(),
            });
        }

        await recordCheck(provider, null);

        return NextResponse.json({
            ok: true,
            // What it read back, so the screen can show it. Seeing
            // "Bratkartoffeln, 4 ingredients" is a different kind of
            // convincing from a green tick.
            title: recipe.title,
            ingredients: recipe.ingredients.length,
            model: key.model,
            credentials: await listAiCredentials(),
        });
    } catch (error) {
        // Through the scrubber a second time even though `providerError`
        // already did it: this branch also catches errors raised before the
        // request was built, and a belt here costs a function call.
        const message = scrub(
            error instanceof Error ? error.message : 'The provider could not be reached.',
            key.apiKey
        ).slice(0, 300);

        await recordCheck(provider, message);

        // 200 with ok:false, not a 5xx. A provider saying no is this
        // endpoint's *answer*, not its failure, and a 502 here would be
        // logged as an outage of a cookbook that is working fine.
        return NextResponse.json({ ok: false, message, credentials: await listAiCredentials() });
    }
}
