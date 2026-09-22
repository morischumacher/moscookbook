import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { extractRecipeFromHtml } from '@/lib/recipeFromHtml';
import { fetchPage, type FetchFailure } from '@/lib/fetchPage';
import { mirrorImageToBlob } from '@/lib/mirrorImage';
import { readableText } from '@/lib/readableText';
import { assistsText, canUseAi, extractRecipeWithAi } from '@/lib/aiImport';
import { aiCapability, rememberModel } from '@/lib/aiConfig';

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
     * Through `fetchPage`, which is the point of this change.
     *
     * For a year this route called `fetch(url, { redirect: 'follow' })` itself,
     * with a textual URL check in front of it and nothing else. The runtime
     * followed redirects without re-checking a single hop and never resolved
     * a hostname, so a public page answering `302 → http://169.254.169.254/…`
     * returned the cloud metadata service into a recipe draft. That is the
     * exact hole `safeFetch` was written to close — and this route, the one
     * with "import" in its name, was the one place still going round it.
     *
     * `fetchPage` does the textual check, the DNS resolution, the per-hop
     * redirect check, the timeout, the size cap and the content-type test.
     * Nothing below needed any of that to be here.
     */
    const page = await fetchPage(parsed.data.url);

    if (!page.ok) {
        return NextResponse.json({ message: FETCH_MESSAGES[page.failure] }, {
            status: FETCH_STATUS[page.failure],
        });
    }

    const html = page.html;
    const url = page.finalUrl;

    try {
        let recipe = extractRecipeFromHtml(html, url);

        /*
         * The rules first, always — a page with schema.org markup is read here
         * and costs nothing. This is the *second* attempt, for the very large
         * number of food blogs that write their ingredients in a plain list
         * with no markup at all and until now imported as a title and a
         * picture.
         *
         * Merged rather than replaced: whatever the markup gave up is the
         * better answer, because it is the site's own statement about itself
         * rather than a reading of its prose.
         */
        const ai = await aiCapability();
        const incomplete = !recipe.title || recipe.ingredients.length === 0 || !recipe.instructions;
        const force = parsed.data.force === true;

        let usedAi = false;

        if ((force && canUseAi(ai)) || (incomplete && assistsText(ai))) {
            try {
                const read = await extractRecipeWithAi(
                    { kind: 'text', text: readableText(html) },
                    ai.keys,
                    (provider, model) => void rememberModel(provider, model)
                );

                recipe = {
                    ...recipe,
                    title: recipe.title || read.title,
                    description: recipe.description || read.description,
                    ingredients:
                        recipe.ingredients.length > 0 ? recipe.ingredients : read.ingredients,
                    instructions: recipe.instructions || read.instructions,
                    category: recipe.category || read.category,
                    nationality: recipe.nationality || read.nationality,
                    servings: recipe.servings ?? read.servings,
                    prepMinutes: recipe.prepMinutes ?? read.prepMinutes,
                    cookMinutes: recipe.cookMinutes ?? read.cookMinutes,
                };

                usedAi = true;
            } catch (error) {
                // The rules' answer is still on the table. An import that
                // returns less than it might is a far better outcome than one
                // that returns an error because an optional extra was down.
                console.error('The AI could not help with this import:', error);
            }
        }

        if (!recipe.title && recipe.ingredients.length === 0) {
            return NextResponse.json(
                {
                    message:
                        'No recipe data found on that page. Try copying the recipe text and pasting it instead.',
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
            usedAi,
        });
    } catch (error) {
        console.error('URL import error:', error);
        return NextResponse.json({ message: 'The page could not be read.' }, { status: 502 });
    }
}

/** One sentence per way a page can fail to arrive, and the status to go with it. */
const FETCH_MESSAGES: Record<FetchFailure, string> = {
    'unsafe-url': 'That URL cannot be imported. Please use a public http(s) address.',
    'http-error': 'The page could not be loaded.',
    'not-a-page': 'That link does not point to a web page.',
    timeout: 'The page took too long to respond.',
    network: 'The page could not be loaded.',
};

const FETCH_STATUS: Record<FetchFailure, number> = {
    'unsafe-url': 400,
    'http-error': 502,
    'not-a-page': 415,
    timeout: 504,
    network: 502,
};
