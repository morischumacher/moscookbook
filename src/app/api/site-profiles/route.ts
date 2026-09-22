import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimit } from '@/lib/rateLimit';
import { fetchPage } from '@/lib/fetchPage';
import { extractRecipeFromHtml } from '@/lib/recipeFromHtml';
import { readableText } from '@/lib/readableText';
import { extractRecipeWithAi } from '@/lib/aiImport';
import { aiCapability, rememberModel } from '@/lib/aiConfig';
import { learnSiteProfile } from '@/lib/siteLearn';
import { hostOf } from '@/lib/siteProfile';
import { listSiteProfiles, siteProfiles } from '@/lib/siteProfileDb';

/**
 * Learning a site on purpose.
 *
 * The import learns as a side effect of needing a model anyway. This is the
 * other way in, and it exists because the automatic path has two gaps that are
 * only visible once you live with it:
 *
 * A site whose profile has quietly gone stale keeps working — badly — until
 * three imports in a row have failed. Somebody who can *see* that a site has
 * changed should not have to import three recipes to say so.
 *
 * And a site you are about to import ten recipes from is worth teaching the
 * cookbook once, deliberately, rather than discovering on the eleventh that
 * the first ten each cost a model call.
 *
 * Pressing this always re-learns, even when a profile already exists. That is
 * the whole point of pressing it: the automatic path deliberately does not
 * re-learn a site it already knows, so without this there is no way to correct
 * one short of deleting it.
 */

const learnSchema = z.object({
    url: z.string().trim().min(1).max(2000),
});

export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    return NextResponse.json({ profiles: await listSiteProfiles() });
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    // Each press fetches a page and calls a model twice. Ten in ten minutes is
    // more than teaching the cookbook a site ever needs.
    const limit = rateLimit(clientKey(req, 'site-learn'), 10, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Zu viele Versuche. Bitte einen Moment warten.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const body = learnSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json({ message: 'Keine Adresse angegeben.' }, { status: 400 });
    }

    const ai = await aiCapability();
    const key = ai.keys[0];

    if (!key) {
        return NextResponse.json(
            { message: 'Es ist kein geprüfter KI-Schlüssel hinterlegt. Ohne Modell lässt sich nichts lernen.' },
            { status: 400 }
        );
    }

    const page = await fetchPage(body.data.url);
    if (!page.ok) {
        return NextResponse.json(
            { message: `Die Seite konnte nicht gelesen werden (${page.failure}).` },
            { status: 400 }
        );
    }

    const host = hostOf(page.finalUrl);
    if (!host) {
        return NextResponse.json({ message: 'Das ist keine Webadresse.' }, { status: 400 });
    }

    /*
     * The recipe first, then the map of where it was.
     *
     * The same order the import uses, and for the same reason: a profile is
     * verified by reproducing an answer, so there has to be an answer first.
     * Asking only for the map would give us something to store and nothing to
     * check it against.
     */
    let recipe;
    try {
        recipe = await extractRecipeWithAi(
            { kind: 'text', text: readableText(page.html) },
            ai.keys,
            (provider, model) => {
                void rememberModel(provider, model);
            }
        );
    } catch (error) {
        return NextResponse.json(
            { message: `Das Modell konnte die Seite nicht lesen: ${error instanceof Error ? error.message : 'unbekannt'}` },
            { status: 502 }
        );
    }

    // A page the model could not read teaches nothing, and the rules' own
    // answer is worth mentioning because it explains an empty result.
    if (recipe.ingredients.length === 0 || recipe.instructions.trim() === '') {
        const rules = extractRecipeFromHtml(page.html, page.finalUrl);
        return NextResponse.json({
            learned: false,
            host,
            message:
                'Auf dieser Seite hat das Modell kein vollständiges Rezept gefunden, also gibt es auch nichts zu lernen.' +
                (rules.title ? ` Die Regeln erkennen nur den Titel: „${rules.title}“.` : ''),
        });
    }

    const result = await learnSiteProfile(page.html, recipe, key);

    if (!result.profile) {
        /*
         * A refusal is the interesting answer, so it is returned as a success
         * with `learned: false` rather than an error. Nothing went wrong — the
         * check did its job, and the reason is what the person needs to see.
         */
        return NextResponse.json({
            learned: false,
            host,
            message: `Nicht gelernt: ${result.note}`,
            ingredientsFound: result.verification?.ingredientsFound ?? null,
            methodFound: result.verification?.methodFound ?? null,
        });
    }

    await siteProfiles.save({
        host,
        profile: result.profile,
        learnedFrom: page.finalUrl,
        learnedBy: `${key.provider}${key.model ? `/${key.model}` : ''}`,
    });

    return NextResponse.json({
        learned: true,
        host,
        profile: result.profile,
        message: `${host} gelernt und gegen diese Seite geprüft.`,
    });
}
