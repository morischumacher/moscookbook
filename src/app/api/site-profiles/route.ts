import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { fetchPage } from '@/lib/fetchPage';
import { extractRecipeFromHtml } from '@/lib/recipeFromHtml';
import { readableText } from '@/lib/readableText';
import { extractRecipeWithAi } from '@/lib/aiImport';
import { aiCapability, rememberModel } from '@/lib/aiConfig';
import { learnSiteProfile } from '@/lib/siteLearn';
import { hostOf } from '@/lib/siteProfile';
import { listSiteProfiles, siteProfiles } from '@/lib/siteProfileDb';
import { scrub } from '@/lib/secretBox';

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

    /*
     * The shared limiter, because this route spends money. Each press fetches
     * a page and calls a model twice; ten in ten minutes is more than teaching
     * the cookbook a site ever needs.
     *
     * It used the in-memory one, whose own comment says it multiplies by the
     * number of warm instances and resets on every cold start — fine for a
     * view counter, and the wrong tool for a route where each call past the
     * limit is a charge at a provider. The database-backed count is the only
     * one that is actually a ceiling.
     */
    const limit = await rateLimitShared(clientKey(req, 'site-learn'), 10, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'Too many attempts. Please wait a moment.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const body = learnSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json({ message: 'Please provide a URL.' }, { status: 400 });
    }

    const ai = await aiCapability();
    const key = ai.keys[0];

    if (!key) {
        return NextResponse.json(
            { message: 'No verified AI key is stored. Nothing can be learned without a model.' },
            { status: 400 }
        );
    }

    const page = await fetchPage(body.data.url);
    if (!page.ok) {
        return NextResponse.json(
            { message: `The page could not be read (${page.failure}).` },
            { status: 400 }
        );
    }

    const host = hostOf(page.finalUrl);
    if (!host) {
        return NextResponse.json({ message: 'That is not a web address.' }, { status: 400 });
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
        // A provider's error text can quote the request that failed, and the
        // request carried the key. The test route scrubs for the same reason.
        const detail = scrub(error instanceof Error ? error.message : 'unknown', key.apiKey).slice(0, 300);
        return NextResponse.json(
            { message: `The model could not read the page: ${detail}` },
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
                'The model found no complete recipe on this page, so there is nothing to learn.' +
                (rules.title ? ` The rules recognise only the title: “${rules.title}”.` : ''),
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
            message: `Not learned: ${result.note}`,
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
        message: `${host} learned and verified against this page.`,
    });
}
