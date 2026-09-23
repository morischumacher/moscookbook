/**
 * When the pipeline asks a model, and what it says about it afterwards.
 *
 * Pulled out of captureProcess: the "should we ask, what do we send, how do we
 * describe what happened" concern is a third of that file and none of the
 * per-kind processing. Everything here is about one attempt to fill a draft's
 * gaps with a model and the honest label that results.
 *
 * Imports aiImport and draftQuality, neither of which imports the pipeline.
 * Never imports Prisma, for the reason the pipeline never does: the test
 * runner has to be able to load it.
 */

import type { ImportedRecipe } from './recipeFromHtml';
import type { AiCapability } from './aiImport';
import { extractRecipeWithAi } from './aiImport';
import { titleProblem } from './draftQuality';
import type { AiTrace, ProcessedCapture, ProcessOptions } from './captureTypes';
import { mergeDrafts } from './captureDraft';
import { reason } from './captureReasons';

/** The trace of a path that never asked. */
export const NOT_ASKED: AiTrace = { provider: null, asked: false, failed: false };

/**
 * One result, built in one place.
 *
 * `readBy` and `provider` have to agree with each other and with what actually
 * happened, at eleven return statements. Spelling them out at each one is how
 * a draft ends up labelled "rules" because somebody added a branch and copied
 * the return above it.
 */
export function outcome(
    status: ProcessedCapture['status'],
    draft: ImportedRecipe | null,
    error: string | null,
    trace: AiTrace = NOT_ASKED,
    readBy?: ProcessedCapture['readBy']
): ProcessedCapture {
    return {
        status,
        draft,
        error,
        readBy:
            readBy ??
            (!trace.asked ? 'rules' : trace.failed ? 'rules+ai-failed' : 'rules+ai'),
        provider: trace.provider,
    };
}

/* -------------------------------------------------------------------------- */
/* The second attempt                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reads some text with the AI and fills whatever the rules left empty.
 *
 * Three properties, each of which took a bug to learn somewhere in this file:
 *
 * **It merges rather than replaces.** The rules' answer is the better answer
 * wherever it exists — a JSON-LD image URL is the site's own chosen
 * photograph, a YouTube title is the video's actual title — and a model asked
 * to read a whole page will cheerfully name the recipe after the page's
 * heading, which is often the blog's name. So the AI only ever fills holes.
 *
 * **It never makes things worse.** A failure returns the draft it was given,
 * untouched. There is no configuration in which switching the AI on can turn a
 * partial import into a failed one.
 *
 * **It is silent about cost.** The caller decides whether to call this; by the
 * time it is called the decision has been made.
 */
export async function fillGapsWithAi(
    draft: ImportedRecipe,
    text: string,
    ai: AiCapability,
    options: ProcessOptions
): Promise<{ draft: ImportedRecipe; trace: AiTrace }> {
    const provider = ai.keys[0]?.provider ?? null;

    /*
     * Two lines of boilerplate is not a recipe and is not worth asking about.
     * Not asking is not the same as asking and failing, so it says so.
     *
     * The caller is responsible for handing over everything it has — see
     * `aiInput` — because this floor was silently refusing the cases the AI
     * exists for. An Instagram reel strips to *zero* characters of readable
     * text, and the entire recipe, ingredients and steps, is sitting in the
     * page's `og:title`. The floor saw an empty string and declined to ask.
     */
    if (text.trim().length < 80) {
        return { draft, trace: { ...NOT_ASKED, tooThin: true } };
    }

    try {
        const parsed = await extractRecipeWithAi({ kind: 'text', text }, ai.keys, options.onModel);

        /*
         * The one place a model is allowed to overrule the rules.
         *
         * Everywhere else what the rules found wins, because it is the site's
         * own statement about itself. That reasoning fails when what they
         * found is not a title at all — a two-thousand-character Instagram
         * caption, a page's "Ben Slater auf Instagram: …", a bare "Rezept".
         * Keeping those over a model's reading is keeping the worse answer out
         * of deference to a rule that was about something else.
         */
        const keepOurTitle = titleProblem(draft.title) === null;

        return { trace: { provider, asked: true, failed: false }, draft: {
            ...mergeDrafts(draft, parsed),
            title: keepOurTitle ? draft.title : parsed.title || draft.title,
            // These four are not part of `mergeDrafts` because they are not
            // strings and an empty one is null rather than ''. Same rule
            // though: what the rules found wins.
            category: draft.category || parsed.category,
            nationality: draft.nationality || parsed.nationality,
            servings: draft.servings ?? parsed.servings,
            prepMinutes: draft.prepMinutes ?? parsed.prepMinutes,
            cookMinutes: draft.cookMinutes ?? parsed.cookMinutes,
        } };
    } catch (error) {
        // Logged, not raised. The rules' answer is still on the table and the
        // person sharing a link in a supermarket does not care which of three
        // providers was having an afternoon.
        console.error('The AI could not help with this capture:', error);
        return { draft, trace: { provider, asked: true, failed: true } };
    }
}

/**
 * Everything worth showing a model, gathered from wherever it ended up.
 *
 * Written after watching two Instagram reels go past the AI untouched. Both
 * were scored `poor` — no ingredients, no method — and both had the whole
 * recipe in front of them: one had "Ingrédients: Poitrine de porc, Persil,
 * Romarin…" and six numbered steps, in the page's `og:title`, two thousand
 * characters of it. The pipeline handed the model `readableText(html)`, which
 * for a page that renders itself in JavaScript is the empty string, and the
 * eighty-character floor did the rest.
 *
 * So the input is assembled rather than picked. The page's prose first, since
 * on an ordinary site it is the recipe; then whatever the rules scraped into
 * the draft, which on a social page is where the content actually is; then
 * anything shared alongside the link.
 *
 * Duplication is not a problem worth solving here — a model reading the same
 * sentence twice produces the same recipe, and the cost of a few hundred extra
 * characters is a fraction of a fraction of a cent. Missing the recipe
 * entirely is the expensive outcome.
 */
export function aiInput(draft: ImportedRecipe, pageText: string, shared: string): string {
    const parts: string[] = [];

    if (pageText.trim()) parts.push(pageText.trim());

    // The draft's own fields, when the page gave nothing. On Instagram and
    // TikTok the title *is* the post, caption and all.
    const fromDraft = [draft.title, draft.description].filter(Boolean).join('\n\n').trim();
    if (fromDraft && fromDraft.length > pageText.trim().length) parts.push(fromDraft);

    if (shared.trim()) parts.push(shared.trim());

    return parts.join('\n\n');
}

/**
 * What to say about a draft that is not ready.
 *
 * "The page held only part of a recipe" was said about three Instagram reels
 * whose captions were, in full, "Leftover bacon? Cook this. Recipe up now in
 * my newsletter." There was no part of a recipe. There was an advertisement
 * for one, and a model was asked, read it correctly, and returned nothing —
 * which is the right answer and was reported as a shortfall.
 *
 * The distinction is worth drawing because the two want different things from
 * whoever reads the inbox. A page that gave up half a recipe wants finishing.
 * A page that never had one wants deleting, and saying so saves somebody
 * opening it to find out.
 */
export function reasonFor(
    status: 'ready' | 'needsWork' | 'failed',
    draft: ImportedRecipe,
    trace: AiTrace,
    kind: 'page' | 'video'
): string | null {
    if (status === 'ready') return null;

    const empty = draft.ingredients.length === 0 && draft.instructions.trim() === '';

    /*
     * Two ways of knowing there was nothing here, and they deserve the same
     * sentence.
     *
     * A model looked and found nothing — that is an answer, not a shortfall.
     * Or there was too little to be worth showing a model at all: fifty-seven
     * characters of "Recipe up now in my newsletter" is not a recipe that
     * failed to parse, it is an advertisement for one.
     */
    if (empty && ((trace.asked && !trace.failed) || trace.tooThin === true)) {
        return reason('noRecipe');
    }

    return kind === 'video' ? reason('videoPartial') : reason('pagePartial');
}
