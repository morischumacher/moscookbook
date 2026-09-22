import type { CaptureSource, CaptureStatus } from './capture';
import { withoutBareUrls } from './capture';
import type { ImportedRecipe } from './recipeFromHtml';
import { extractRecipeFromHtml } from './recipeFromHtml';
import { parseRecipeText } from './recipeParser';
import { fetchPage } from './fetchPage';
import { youtubeVideoId, extractYoutubePage, cleanYoutubeDescription } from './youtube';
import { fetchImageAsBase64 } from './fetchImage';
import { readableText } from './readableText';
import { assessDraft, titleProblem, worthAsking } from './draftQuality';
import {
    assistsText,
    canUseAi,
    capabilityFromEnv,
    extractRecipeWithAi,
    type AiCapability,
    type ModelReport,
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
     *   rules            — no model was asked. Structured data, or a clean parse.
     *   rules+ai         — the rules found part of it, a model filled the gaps.
     *   rules+ai-failed  — a model was asked and did not answer.
     *   ai               — a model produced it. A photograph, always.
     *
     * The third one exists because of a question that had no good answer: "the
     * setting says ask when the rules fall short — what happens when the model
     * is then also down?" The behaviour was already right (the rules' draft is
     * kept, nothing fails, nothing is lost). What was wrong is that it was
     * *invisible*: the capture came back labelled "rules", exactly as if the
     * model had never been needed. So a key with no credit left, a wrong model
     * name, a provider having an afternoon — all of it looked like the cookbook
     * working normally, and the way you would find out is by wondering, weeks
     * later, why the AI never seemed to do anything.
     */
    readBy: 'rules' | 'rules+ai' | 'rules+ai-failed' | 'ai';
    /** Which provider answered, when one did. */
    provider: string | null;
}

/**
 * How this run is allowed to behave, beyond what the capability says.
 *
 * `force` is somebody pressing "read this with the AI" on a draft the scoring
 * called good. That is a different act from an automatic import and it obeys a
 * different rule: the quality gate is skipped entirely, and the mode gate
 * loosens from `assistsText` to `canUseAi` — so "nur Bilder" does not refuse a
 * button somebody deliberately pressed, while "nie" still means never.
 *
 * The scoring is a guess about whether asking would help. A person looking at
 * the draft has better information than the scoring does, and the scoring
 * exists to save them the trouble, not to overrule them.
 */
export interface ProcessOptions {
    force?: boolean;
    /**
     * Told which model answered, so a caller with a database can write it
     * down. See `rememberModel`: the fallback walks a list when the first
     * choice is busy or out of quota, and the one that worked is worth keeping
     * rather than rediscovering on every share.
     */
    onModel?: ModelReport;
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
 * This is now the *scored* question rather than the three-field one it used to
 * be — see lib/draftQuality.ts for why a title, one ingredient and a non-empty
 * instructions field turned out to be a bar that "Cook Mode / Servings / Print
 * Recipe" clears comfortably.
 *
 * `good` is what used to be called ready. Everything else wants a human for a
 * minute, which is what the inbox is.
 */
function completeness(draft: ImportedRecipe): 'ready' | 'needsWork' {
    return assessDraft(draft).quality === 'good' ? 'ready' : 'needsWork';
}

/**
 * Is this draft worth spending a model on?
 *
 * Deliberately *not* the same question as `completeness`, even though today
 * they agree. "Is this good enough to publish untouched" and "would asking
 * again plausibly improve it" are different questions about different risks,
 * and collapsing them is how a cookbook ends up paying to re-read pages it
 * read perfectly.
 */
function shouldAsk(draft: ImportedRecipe, options: ProcessOptions): boolean {
    return options.force === true || worthAsking(assessDraft(draft));
}

/** Whether a text path may ask at all, under this capability and these options. */
function mayAskAboutText(ai: AiCapability, options: ProcessOptions): boolean {
    return options.force === true ? canUseAi(ai) : assistsText(ai);
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
interface AiTrace {
    provider: string | null;
    asked: boolean;
    failed: boolean;
}

const NOT_ASKED: AiTrace = { provider: null, asked: false, failed: false };

function outcome(
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
async function fillGapsWithAi(
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
    if (text.trim().length < 80) return { draft, trace: NOT_ASKED };

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
function aiInput(draft: ImportedRecipe, pageText: string, shared: string): string {
    const parts: string[] = [];

    if (pageText.trim()) parts.push(pageText.trim());

    // The draft's own fields, when the page gave nothing. On Instagram and
    // TikTok the title *is* the post, caption and all.
    const fromDraft = [draft.title, draft.description].filter(Boolean).join('\n\n').trim();
    if (fromDraft && fromDraft.length > pageText.trim().length) parts.push(fromDraft);

    if (shared.trim()) parts.push(shared.trim());

    return parts.join('\n\n');
}

/* -------------------------------------------------------------------------- */
/* One path per kind of thing                                                  */
/* -------------------------------------------------------------------------- */

async function processYoutube(
    url: string,
    rawText: string | null,
    ai: AiCapability,
    options: ProcessOptions
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
    let trace: AiTrace = NOT_ASKED;

    if (shouldAsk(merged, options) && mayAskAboutText(ai, options)) {
        const helped = await fillGapsWithAi(
            merged,
            [video.title, description, shared].filter(Boolean).join('\n\n'),
            ai,
            options
        );
        merged = helped.draft;
        trace = helped.trace;
    }

    const status = completeness(merged);

    return outcome(
        status,
        merged,
        status === 'ready'
            ? null
            : 'The description did not hold a full recipe — it may only be spoken in the video.',
        trace
    );
}

async function processWebPage(
    url: string,
    rawText: string | null,
    ai: AiCapability,
    options: ProcessOptions
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
            let trace: AiTrace = NOT_ASKED;

            if (shouldAsk(draft, options) && mayAskAboutText(ai, options)) {
                const helped = await fillGapsWithAi(draft, shared, ai, options);
                draft = helped.draft;
                trace = helped.trace;
            }

            return outcome(
                completeness(draft),
                draft,
                'The page could not be read; the shared text was used instead.',
                trace
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
    let trace: AiTrace = NOT_ASKED;

    if (shouldAsk(draft, options) && mayAskAboutText(ai, options)) {
        const helped = await fillGapsWithAi(
            draft,
            aiInput(draft, readableText(page.html), shared),
            ai,
            options
        );
        draft = helped.draft;
        trace = helped.trace;
    }

    const status = completeness(draft);
    return outcome(
        status,
        draft,
        status === 'ready' ? null : 'The page held only part of a recipe.',
        trace
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
async function processImage(
    imageUrl: string | null,
    ai: AiCapability,
    options: ProcessOptions
): Promise<ProcessedCapture> {
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
            ai.keys,
            options.onModel
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
            { provider: ai.keys[0]?.provider ?? null, asked: true, failed: false },
            'ai'
        );
    } catch (error) {
        // A missing key, a rate limit, a bad month at every provider. None of
        // it is worth losing the screenshot over.
        console.error('Reading a picture failed:', error);
        return outcome(
            'needsWork',
            withPicture,
            'The picture is saved, but reading it did not work. Try again from the inbox.',
            { provider: ai.keys[0]?.provider ?? null, asked: true, failed: true },
            'rules+ai-failed'
        );
    }
}

export async function processCapture(
    capture: ProcessableCapture,
    // The environment alone when nobody says otherwise. The routes pass the
    // real thing, which also knows about the rows; the tests pass whatever
    // case they are checking.
    ai: AiCapability = capabilityFromEnv(),
    options: ProcessOptions = {}
): Promise<ProcessedCapture> {
    try {
        if (capture.kind === 'image') {
            return await processImage(capture.imageUrl ?? null, ai, options);
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
            let trace: AiTrace = NOT_ASKED;

            if (shouldAsk(draft, options) && mayAskAboutText(ai, options)) {
                const helped = await fillGapsWithAi(draft, text, ai, options);
                draft = helped.draft;
                trace = helped.trace;
            }

            if (completeness(draft) !== 'ready' && capture.imageUrl) {
                const fromPicture = await processImage(capture.imageUrl, ai, options);
                if (fromPicture.status === 'ready') return fromPicture;
            }

            return outcome(
                completeness(draft),
                draft,
                completeness(draft) === 'ready' ? null : 'Only part of a recipe was recognised.',
                trace
            );
        }

        const url = capture.sourceUrl;
        if (!url) {
            return outcome('failed', null, 'No link to follow.');
        }

        const source = capture.source as CaptureSource;
        const result =
            source === 'youtube'
                ? await processYoutube(url, capture.rawText, ai, options)
                : await processWebPage(url, capture.rawText, ai, options);

        // The Instagram screenshot case, from the other side: the link could
        // not be read and the caption was not the recipe, but a picture came
        // with the share. Worth one more attempt before giving up.
        if (result.status !== 'ready' && capture.imageUrl) {
            const fromPicture = await processImage(capture.imageUrl, ai, options);
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
