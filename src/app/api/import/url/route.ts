import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { rateLimit, clientKey } from '@/lib/rateLimit';
import { extractRecipeFromHtml, isSafePublicUrl } from '@/lib/recipeFromHtml';
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

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const limit = rateLimit(clientKey(req, 'import-url'), 30, 10 * 60 * 1000);
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

    const url = parsed.data.url.startsWith('http') ? parsed.data.url : `https://${parsed.data.url}`;

    if (!isSafePublicUrl(url)) {
        return NextResponse.json(
            { message: 'That URL cannot be imported. Please use a public http(s) address.' },
            { status: 400 }
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                // Some sites serve a stripped page to unknown agents.
                'User-Agent': 'Mozilla/5.0 (compatible; moscookbook-import/1.0)',
                Accept: 'text/html,application/xhtml+xml',
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { message: `The page could not be loaded (HTTP ${response.status}).` },
                { status: 502 }
            );
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('html') && !contentType.includes('xml')) {
            return NextResponse.json(
                { message: 'That link does not point to a web page.' },
                { status: 415 }
            );
        }

        const html = (await response.text()).slice(0, MAX_HTML_BYTES);
        let recipe = extractRecipeFromHtml(html, response.url || url);

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
        if (error instanceof Error && error.name === 'AbortError') {
            return NextResponse.json({ message: 'The page took too long to respond.' }, { status: 504 });
        }
        console.error('URL import error:', error);
        return NextResponse.json({ message: 'The page could not be loaded.' }, { status: 502 });
    } finally {
        clearTimeout(timeout);
    }
}
