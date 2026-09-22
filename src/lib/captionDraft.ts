/**
 * The caption of a page that has no body.
 *
 * Instagram, TikTok and Threads send a page with nothing in it: the body is
 * an empty mount point and the recipe is in og:title. This reads that with
 * the rules, which needs no model. It was the last thing added to
 * captureProcess and had its own test suite from the start, which is the
 * tell that it wanted its own module.
 */

import type { ImportedRecipe } from './recipeFromHtml';
import { metaContent, metaLines } from './htmlMeta';
import { withoutPlatformWrapper } from './pageTitle';
import { parseRecipeText } from './recipeParser';
import { emptyDraft } from './captureDraft';



/**
 * What a platform page says about itself.
 *
 * `og:title` first, because that is where Instagram puts the caption, with the
 * platform's own wrapper taken off — `Ben Slater auf Instagram: "…"` is the
 * author and the platform around the thing we want.
 *
 * Worth being precise about what that buys, because it is less than it looks:
 * the parser reads the first line as a title and we do not take the title from
 * a caption, so the author's name never reaches a field either way. What the
 * stripping actually fixes is the closing quotation mark, which otherwise ends
 * up glued to the last step of the method.
 *
 * `og:description` after it rather than instead: some platforms split the
 * caption across both, and the two together are the caption. Duplication is
 * handled by not caring — the parser reads a list of ingredients twice as the
 * same list of ingredients, and `mergeDrafts` only fills holes anyway.
 */
function captionOf(html: string): string {
    const title = withoutPlatformWrapper(metaLines(html, 'og:title'));
    const description = metaLines(html, 'og:description');

    if (description === '' || title.includes(description)) return title;
    if (description.includes(title)) return description;

    return `${title}\n\n${description}`;
}

/**
 * The caption as a recipe, or null.
 *
 * Returns null rather than an empty draft when there is nothing in it, so the
 * caller's "did this help" comparison is never asked about a draft that was
 * never going to.
 */
export function captionDraft(html: string, sourceUrl: string): ImportedRecipe | null {
    /*
     * No length floor, and its absence is the considered position rather than
     * an omission.
     *
     * There was one, at 120 characters, chosen by feel. It rejected
     * "Pasta / Zutaten: / 400 g Nudeln / 2 EL Öl" — 36 characters, two real
     * ingredients with real quantities, a genuine if small recipe. Lowering it
     * to 40 rejected the same caption by four characters, which is the same
     * mistake wearing a smaller number.
     *
     * The guard that belongs here is the damage comparison at the call site:
     * it looks at what came *out* instead of guessing from how much went in,
     * and it throws away anything that does not leave the draft better. Two
     * guards where one measures and the other guesses is not defence in depth;
     * it is a measurement with a guess allowed to overrule it.
     */
    const parsed = parseRecipeText(captionOf(html));
    if (parsed.ingredients.length === 0 && parsed.instructions.trim() === '') return null;

    /*
     * A caption with no ingredients in it is prose, and prose is not a method.
     *
     * `parseRecipeText` has to put text somewhere, so a caption it cannot find
     * a list in comes back with the whole thing as `instructions`. On the
     * pages this was written for that is harmless — those captions *are* the
     * recipe. On every other page on the web it is the `og:description`, which
     * is a sentence of marketing written to be read in a search result:
     *
     *     "The crispiest fried chicken sandwich you will ever make at home."
     *
     * Eighty characters that look, to a scoring function, exactly like a
     * method the page was kind enough to supply. It lowered the damage, so the
     * caption was merged; and then it *was* the method — `mergeDrafts` fills
     * holes and this was no longer a hole, so the model's real reading of the
     * page was discarded on arrival. A recipe blog came back with a slogan
     * where its method should be, and the transcript suite caught it: 84
     * characters where a recorded import had 3654.
     *
     * So the picture and the description still come along — those are right
     * even on a blurb, and the picture is the one thing these pages never get
     * wrong — and the method does not. A list of ingredients is what tells the
     * two kinds of caption apart, because a caption that really is a recipe
     * has one and a slogan does not.
     */
    const isRecipe = parsed.ingredients.length > 0;

    return {
        ...emptyDraft(sourceUrl),
        // The title is left to the rules and to `titleProblem`. A caption's
        // first line is a good recipe name about half the time, and the half
        // where it is not is "POV: you have 20 minutes and one pan".
        description: parsed.description,
        ingredients: parsed.ingredients,
        instructions: isRecipe ? parsed.instructions : '',
        // The picture is the one thing these pages always get right.
        imageUrl: metaContent(html, 'og:image'),
    };
}
