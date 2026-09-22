import type { CaptureSource, CaptureStatus } from './capture';
import { withoutBareUrls } from './capture';
import type { ImportedRecipe } from './recipeFromHtml';
import { extractRecipeFromHtml } from './recipeFromHtml';
import { parseRecipeText } from './recipeParser';
import { fetchPage } from './fetchPage';
import { youtubeVideoId, extractYoutubePage, cleanYoutubeDescription } from './youtube';
import { fetchImageAsBase64 } from './fetchImage';
import { readableText } from './readableText';
import {
    assistsText,
    canUseAi,
    capabilityFromEnv,
    extractRecipeWithAi,
    type AiCapability,
} from './aiImport';

/**
 * Turning a capture into a recipe draft.
 *
 * **Every path here is rule-based first, always, in every configuration.** A
 * page with clean structured data is read by the rules and never costs a
 * penny; a YouTube description that parses is parsed. That is not a fallback
 * arrangement, it is the arrangement, and the AI is what happens next when it
 * has not worked.
 *
 * Which used to be true of exactly one path. A screenshot is pixels and there
 * is no rule that reads pixels, so the picture path asked and every other path
 * gave up — a recipe site with no JSON-LD came back as `needsWork` with a
 * title and nothing else, while a key that could have read it sat unused. So
 * the second attempt now exists everywhere, and `AiCapability.mode` decides
 * whether it is allowed to happen:
 *
 *   off     — never ask. The rules, and nothing else.
 *   images  — ask only where there is no rule: a photograph.
 *   always  — also ask as a *second* attempt when the rules came up short.
 *
 * The capability is **passed in** rather than looked up, for two reasons that
 * both matter. Looking it up means reading the database, and this module is
 * imported by the test suite, which cannot load Prisma. And a caller that
 * hands in its own capability is a caller whose behaviour can be checked at
 * every one of those three settings without setting an environment variable.
 *
 * Nothing in here throws for an unreadable source: a capture that cannot be
 * parsed is a capture waiting for a better parser, not an error. Nothing in
 * here ever *requires* a key.
 */

export interface ProcessedCapture {
    status: Extract<CaptureStatus, 'ready' | 'needsWork' | 'failed'>;
    draft: ImportedRecipe | null;
    /** Shown in the inbox. A reason, not a stack trace. */
    error: string | null;
    /**
     * How this draft came to exist, in the inbox's own words.
     *
     * Not bookkeeping. A draft produced by rules is a transcription of what a
     * page said; a draft produced by a model is a *reading* of what a page
     * said, and the second one can be confidently wrong in ways the first
     * cannot. Somebody deciding how carefully to check a draft before
     * publishing it is entitled to know which they are looking at, and until
     * now the two were indistinguishable once they reached the inbox.
     *
     *   rules     — no model was asked. Structured data, or a clean parse.
     *   rules+ai  — the rules found part of it and a model filled the gaps.
     *   ai        — a model produced it. A photograph, always.
     */
    readBy: 'rules' | 'rules+ai' | 'ai';
    /** Which provider answered, when one did. */
    provider: string | null;
}

export interface ProcessableCapture {
    kind: string;
    source: string;
    sourceUrl: string | null;
    rawText: string | null;
    /** Only set once a photograph has been uploaded. */
    imageUrl?: string | null;
}

function emptyDraft(sourceUrl: string): ImportedRecipe {
    return {
        title: '',
        description: '',
        ingredients: [],
        instructions: '',
        imageUrl: '',
        category: '',
        nationality: '',
        servings: null,
        prepMinutes: null,
        cookMinutes: null,
        sourceUrl,
    };
}

/**
 * Enough to publish without opening the editor?
 *
 * A title alone is not a recipe, and neither is a list of ingredients with no
 * method. Anything short of both is `needsWork` — which does not mean broken,
 * only that it wants a human for a minute.
 */
function completeness(draft: ImportedRecipe): 'ready' | 'needsWork' {
    const hasTitle = draft.title.trim() !== '';
    const hasIngredients = draft.ingredients.length > 0;
    const hasInstructions = draft.instructions.trim() !== '';
    return hasTitle && hasIngredients && hasInstructions ? 'ready' : 'needsWork';
}

/** Fills the gaps in `draft` from `fallback`, without overwriting real data. */
function mergeDrafts(draft: ImportedRecipe, fallback: Partial<ImportedRecipe>): ImportedRecipe {
    return {
        ...draft,
        title: draft.title || (fallback.title ?? ''),
        description: draft.description || (fallback.description ?? ''),
        ingredients: draft.ingredients.length > 0 ? draft.ingredients : (fallback.ingredients ?? []),
        instructions: draft.instructions || (fallback.instructions ?? ''),
        imageUrl: draft.imageUrl || (fallback.imageUrl ?? ''),
    };
}

/**
 * One result, built in one place.
 *
 * `readBy` and `provider` have to agree with each other and with what actually
 * happened, at eleven return statements. Spelling them out at each one is how
 * a draft ends up labelled "rules" because somebody added a branch and copied
 * the return above it.
 */
function outcome(
    status: ProcessedCapture['status'],
    draft: ImportedRecipe | null,
    error: string | null,
    provider: string | null = null,
    readBy: ProcessedCapture['readBy'] = provider ? 'rules+ai' : 'rules'
): ProcessedCapture {
    return { status, draft, error, readBy, provider };
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
async function fillGapsWithAi(
    draft: ImportedRecipe,
    text: string,
    ai: AiCapability
): Promise<{ draft: ImportedRecipe; used: string | null }> {
    // Two lines of boilerplate is not a recipe and is not worth asking about.
    if (text.trim().length < 80) return { draft, used: null };

    try {
        const parsed = await extractRecipeWithAi({ kind: 'text', text }, ai.keys);

        return { used: ai.keys[0]?.provider ?? null, draft: {
            ...mergeDrafts(draft, parsed),
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
        return { draft, used: null };
    }
}

/* -------------------------------------------------------------------------- */
/* One path per kind of thing                                                  */
/* -------------------------------------------------------------------------- */

async function processYoutube(
    url: string,
    rawText: string | null,
    ai: AiCapability
): Promise<ProcessedCapture> {
    const videoId = youtubeVideoId(url);
    if (!videoId) {
        return outcome('failed', null, 'Not a YouTube video link.');
    }

    const page = await fetchPage(url);
    if (!page.ok) {
        return outcome('failed', null, `YouTube could not be read (${page.failure}).`);
    }

    const video = extractYoutubePage(page.html, videoId);
    const description = cleanYoutubeDescription(video.description);
    const parsed = parseRecipeText(description);

    const draft: ImportedRecipe = {
        ...emptyDraft(url),
        ...parsed,
        imageUrl: video.imageUrl,
        // The video's own title wins outright rather than filling a gap. The
        // parser names a recipe after the first line it is given, and the first
        // line of a description is a sentence — "Viel Spaß beim Nachkochen!"
        // is what that produced before this was an override.
        //
        // No invented description either: a line like "from a video by X" would
        // be written in one language into a cookbook that has two. Attribution
        // belongs to `sourceUrl`, which the recipe page can render in whichever
        // language the reader chose.
        title: video.title || parsed.title,
    };

    // The description often is not the recipe at all. Whatever was shared
    // alongside the link is then the better source.
    const shared = rawText ? withoutBareUrls(rawText) : '';
    const fromShare = shared ? parseRecipeText(shared) : null;
    let merged = fromShare ? mergeDrafts(draft, fromShare) : draft;

    /*
     * A description the rules could not read is the case this is for, and it
     * is common: half of cooking YouTube writes its ingredients as prose, in
     * among three paragraphs of links, and the parser needs a list.
     *
     * The title goes in with it. Without it a model reading a bare description
     * has nothing to name the dish after and invents something plausible from
     * the ingredients — "Nudelauflauf" for a video called "Mamas Auflauf".
     */
    let usedAi: string | null = null;

    if (completeness(merged) !== 'ready' && assistsText(ai)) {
        const helped = await fillGapsWithAi(
            merged,
            [video.title, description, shared].filter(Boolean).join('\n\n'),
            ai
        );
        merged = helped.draft;
        usedAi = helped.used;
    }

    const status = completeness(merged);

    return outcome(
        status,
        merged,
        status === 'ready'
            ? null
            : 'The description did not hold a full recipe — it may only be spoken in the video.',
        usedAi
    );
}

async function processWebPage(
    url: string,
    rawText: string | null,
    ai: AiCapability
): Promise<ProcessedCapture> {
    const page = await fetchPage(url);

    if (!page.ok) {
        // A page that cannot be fetched is not the end: Instagram blocks
        // readers, but its share carries the caption, and that is often the
        // whole recipe.
        const shared = rawText ? withoutBareUrls(rawText) : '';
        if (shared) {
            const parsed = parseRecipeText(shared);
            let draft = { ...emptyDraft(url), ...parsed };
            let usedAi: string | null = null;

            if (completeness(draft) !== 'ready' && assistsText(ai)) {
                const helped = await fillGapsWithAi(draft, shared, ai);
                draft = helped.draft;
                usedAi = helped.used;
            }

            return outcome(
                completeness(draft),
                draft,
                'The page could not be read; the shared text was used instead.',
                usedAi
            );
        }
        return outcome('failed', null, `The page could not be read (${page.failure}).`);
    }

    const extracted = extractRecipeFromHtml(page.html, page.finalUrl);
    const shared = rawText ? withoutBareUrls(rawText) : '';
    const fromShare = shared ? parseRecipeText(shared) : null;
    let draft = fromShare ? mergeDrafts(extracted, fromShare) : extracted;

    /*
     * This is the gap that was worth closing. A recipe site with schema.org
     * markup has always imported perfectly; a food blog that writes its
     * ingredients in a `<ul>` with no markup at all has always imported as a
     * title, a picture and nothing else — and there are a great many of those.
     *
     * The page is stripped to its words first. See `readableText`: what is sent
     * is the prose, not four hundred kilobytes of markup and script.
     */
    let usedAi: string | null = null;

    if (completeness(draft) !== 'ready' && assistsText(ai)) {
        const helped = await fillGapsWithAi(draft, readableText(page.html), ai);
        draft = helped.draft;
        usedAi = helped.used;
    }

    const status = completeness(draft);
    return outcome(
        status,
        draft,
        status === 'ready' ? null : 'The page held only part of a recipe.',
        usedAi
    );
}

/**
 * A screenshot, or a photograph of a page.
 *
 * The one path with no rule-based alternative, and it degrades rather than
 * failing: with no key the picture is kept, the capture says what it needs,
 * and somebody types it up. A screenshot in the inbox with a clear note is a
 * far better outcome than a rejected share, which is what standing in a
 * kitchen with a photograph of a cookbook page actually looks like.
 */
async function processImage(imageUrl: string | null, ai: AiCapability): Promise<ProcessedCapture> {
    if (!imageUrl) {
        return outcome('failed', null, 'No picture was stored.');
    }

    const withPicture = { ...emptyDraft(''), imageUrl };

    if (!canUseAi(ai)) {
        return outcome(
            'needsWork',
            withPicture,
            'The picture is saved. Reading it needs the AI import, or typing it in.'
        );
    }

    const image = await fetchImageAsBase64(imageUrl);

    if (!image.ok) {
        return outcome(
            'needsWork',
            withPicture,
            `The picture is saved, but could not be read back (${image.failure}).`
        );
    }

    try {
        const parsed = await extractRecipeWithAi(
            { kind: 'image', base64: image.base64, mediaType: image.mediaType },
            ai.keys
        );

        // The picture stays the draft's picture. A screenshot of an Instagram
        // post is a perfectly good photograph of the dish, and the alternative
        // is a recipe with no picture at all.
        const draft: ImportedRecipe = { ...withPicture, ...parsed, imageUrl };
        const status = completeness(draft);

        // Always 'ai', never 'rules+ai': there were no rules here. A
        // photograph is the one source with nothing else to read it.
        return outcome(
            status,
            draft,
            status === 'ready' ? null : 'Only part of a recipe was legible in the picture.',
            ai.keys[0]?.provider ?? null,
            'ai'
        );
    } catch (error) {
        // A missing key, a rate limit, a bad month at every provider. None of
        // it is worth losing the screenshot over.
        console.error('Reading a picture failed:', error);
        return outcome(
            'needsWork',
            withPicture,
            'The picture is saved, but reading it did not work. Try again from the inbox.'
        );
    }
}

export async function processCapture(
    capture: ProcessableCapture,
    // The environment alone when nobody says otherwise. The routes pass the
    // real thing, which also knows about the rows; the tests pass whatever
    // case they are checking.
    ai: AiCapability = capabilityFromEnv()
): Promise<ProcessedCapture> {
    try {
        if (capture.kind === 'image') {
            return await processImage(capture.imageUrl ?? null, ai);
        }

        if (capture.kind === 'text') {
            const text = withoutBareUrls(capture.rawText ?? '');
            if (text.trim() === '') {
                return outcome('failed', null, 'Nothing was sent.');
            }
            let draft = {
                ...emptyDraft(''),
                ...parseRecipeText(text),
                // A caption shared together with its screenshot: the words are
                // the recipe, the picture is the picture.
                imageUrl: capture.imageUrl ?? '',
            };

            // A mailed recipe, or a long note typed into a share sheet. The
            // parser wants a shape — a heading, a list, then steps — and what
            // arrives by e-mail is very often four paragraphs of prose from
            // somebody's aunt, which is exactly what a model is good at.
            let usedAi: string | null = null;

            if (completeness(draft) !== 'ready' && assistsText(ai)) {
                const helped = await fillGapsWithAi(draft, text, ai);
                draft = helped.draft;
                usedAi = helped.used;
            }

            if (completeness(draft) !== 'ready' && capture.imageUrl) {
                const fromPicture = await processImage(capture.imageUrl, ai);
                if (fromPicture.status === 'ready') return fromPicture;
            }

            return outcome(
                completeness(draft),
                draft,
                completeness(draft) === 'ready' ? null : 'Only part of a recipe was recognised.',
                usedAi
            );
        }

        const url = capture.sourceUrl;
        if (!url) {
            return outcome('failed', null, 'No link to follow.');
        }

        const source = capture.source as CaptureSource;
        const result =
            source === 'youtube'
                ? await processYoutube(url, capture.rawText, ai)
                : await processWebPage(url, capture.rawText, ai);

        // The Instagram screenshot case, from the other side: the link could
        // not be read and the caption was not the recipe, but a picture came
        // with the share. Worth one more attempt before giving up.
        if (result.status !== 'ready' && capture.imageUrl) {
            const fromPicture = await processImage(capture.imageUrl, ai);
            if (fromPicture.status === 'ready') return fromPicture;
        }

        return result;
    } catch (error) {
        // The raw capture is still in the database, so this is recoverable:
        // the inbox offers a retry once the cause is fixed.
        console.error('Capture processing error:', error);
        return outcome('failed', null, 'Something went wrong while reading this.');
    }
}
