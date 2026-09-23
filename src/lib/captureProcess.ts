import { withoutBareUrls, type CaptureSource } from './capture';
import type { ImportedRecipe } from './recipeFromHtml';
import { extractRecipeFromHtml } from './recipeFromHtml';
import { parseRecipeText } from './recipeParser';
import { fetchPage } from './fetchPage';
import { youtubeVideoId, extractYoutubePage, cleanYoutubeDescription } from './youtube';
import { fetchImageAsBase64 } from './fetchImage';
import { readableText } from './readableText';
import { assessDraft, worthAsking } from './draftQuality';
import { assistsText, canUseAi, capabilityFromEnv, completeWithKey, extractRecipeWithAi, type AiCapability } from './aiImport';
import { applyProfile, hostOf, NO_PROFILES } from './siteProfile';
import { learnSiteProfile } from './siteLearn';
import type { AiTrace, ProcessableCapture, ProcessedCapture, ProcessOptions } from './captureTypes';
import { completeness, damageOf, draftFromProfile, emptyDraft, mergeDrafts } from './captureDraft';
import { aiInput, fillGapsWithAi, NOT_ASKED, outcome, reasonFor } from './captureAi';
import { captionDraft } from './captionDraft';
import { reason } from './captureReasons';
import { recipeLinksIn } from './recipeLinks';
import { recipeElsewhere } from './socialHints';
import { instagramEmbedUrl, instagramShortcode, readInstagramEmbed } from './instagram';
import { bestCaptionTrack, captionText, captionTracksFrom } from './youtubeCaptions';
import { dishName, handleFromUrl, NO_ACCOUNT_SITES, pickResult, resultsFromSearchHtml, resultsFromWpJson, searchUrls, sitesInText } from './authorSite';

// The public shapes, re-exported: routes and tests import them from here.
export type { ProcessableCapture, ProcessedCapture, ProcessOptions } from './captureTypes';

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

/* -------------------------------------------------------------------------- */
/* One path per kind of thing                                                  */
/* -------------------------------------------------------------------------- */

/** No model, whatever the configuration: the rules' attempt, before anything is paid for. */
const RULES_ONLY: AiCapability = { mode: 'off', keys: [] };

/**
 * "Full recipe on my blog", followed.
 *
 * A description or caption that points at the recipe instead of holding it.
 * The link is read like any shared page — rules, what we know about the site,
 * a model if the rules fall short and a model is allowed — and used only if
 * it comes back complete. At most two links, the likeliest first; the author's
 * other channels and shops are never followed (see `recipeLinksIn`).
 */
async function fromLinkedRecipe(
    text: string,
    sharedUrl: string,
    ai: AiCapability,
    options: ProcessOptions
): Promise<ProcessedCapture | null> {
    for (const link of recipeLinksIn(text)) {
        const result = await processWebPage(link, null, ai, options);
        if (result.status === 'ready' && result.draft) {
            // Filed under what was shared: the video or post is what the
            // inbox and the duplicate check know it by.
            return { ...result, draft: { ...result.draft, sourceUrl: sharedUrl } };
        }
    }
    return null;
}

/**
 * "Recipe on pattyplates.com (link in bio)", looked up on that site.
 *
 * The site is the one the text names, or the one this account's posts named
 * before. The dish is searched for there and the matching page read like any
 * shared page — rules first, so a blog with recipe markup costs nothing. A
 * site the text names is remembered for the account whatever the search
 * finds. See authorSite.ts.
 */
async function fromAuthorSite(
    text: string,
    account: { platform: string; handle: string } | null,
    sharedUrl: string,
    ai: AiCapability,
    options: ProcessOptions
): Promise<ProcessedCapture | null> {
    const accounts = options.accounts ?? NO_ACCOUNT_SITES;
    const named = sitesInText(text);
    if (account && named[0]) await accounts.remember(account.platform, account.handle, named[0]).catch(() => undefined);

    const remembered = named.length === 0 && account ? await accounts.get(account.platform, account.handle).catch(() => null) : null;
    const hosts = remembered ? [remembered] : named;
    const dish = dishName(text);
    if (hosts.length === 0 || !dish) return null;

    for (const host of hosts) {
        for (const [index, address] of searchUrls(host, dish).entries()) {
            const page = await fetchPage(address, { json: index === 0 });
            if (!page.ok) continue;
            const link = pickResult(index === 0 ? resultsFromWpJson(page.html) : resultsFromSearchHtml(page.html, host), dish);
            if (!link) continue;
            const result = await processWebPage(link, null, ai, options);
            if (result.status === 'ready' && result.draft) {
                return { ...result, draft: { ...result.draft, sourceUrl: sharedUrl } };
            }
            break;
        }
    }
    return null;
}

async function processYoutube(
    url: string,
    rawText: string | null,
    ai: AiCapability,
    options: ProcessOptions
): Promise<ProcessedCapture> {
    const videoId = youtubeVideoId(url);
    if (!videoId) {
        return outcome('failed', null, reason('notYoutube'));
    }

    const page = await fetchPage(url);
    if (!page.ok) {
        return outcome('failed', null, reason('youtubeUnreadable', page.failure));
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
     * "Das ganze Rezept findet ihr auf meinem Blog: https://…" — the raw
     * description, since the cleaned one has had its bare links removed.
     * The page's picture is kept when the blog has none.
     */
    if (shouldAsk(merged, options)) {
        const linked = await fromLinkedRecipe([video.description, rawText ?? ''].join('\n'), url, ai, options);
        if (linked?.draft) {
            return { ...linked, draft: mergeDrafts(linked.draft, { imageUrl: video.imageUrl }) };
        }
        // "Full recipe on myblog.com", with no link: searched for there.
        const onSite = await fromAuthorSite([video.title, video.description].join('\n'), null, url, ai, options);
        if (onSite?.draft) {
            return { ...onSite, draft: mergeDrafts(onSite.draft, { imageUrl: video.imageUrl }) };
        }
    }

    /*
     * A description the rules could not read is the case this is for, and it
     * is common: half of cooking YouTube writes its ingredients as prose, in
     * among three paragraphs of links, and the parser needs a list.
     *
     * The title goes in with it. Without it a model reading a bare description
     * has nothing to name the dish after and invents something plausible from
     * the ingredients — "Nudelauflauf" for a video called "Mamas Auflauf".
     *
     * And what is said in the video, when YouTube hands out its subtitles: a
     * recipe that is only spoken is a page of text once it is written down.
     * Only fetched when a model is going to read it — the rules cannot do
     * anything with a transcript.
     */
    let trace: AiTrace = NOT_ASKED;
    const tracks = captionTracksFrom(page.html);

    if (shouldAsk(merged, options) && mayAskAboutText(ai, options)) {
        const spoken = await spokenText(tracks);
        const helped = await fillGapsWithAi(
            merged,
            [video.title, description, shared, spoken ? `Gesprochen im Video / spoken in the video:\n${spoken}` : '']
                .filter(Boolean)
                .join('\n\n'),
            ai,
            options
        );
        merged = helped.draft;
        trace = helped.trace;
    }

    const status = completeness(merged);
    // No ingredients is no recipe: a line of "So gut!" is not a method.
    const empty = merged.ingredients.length === 0;

    // Said precisely, because each wants something different from whoever
    // reads the inbox: subtitles a model could read, or a video to watch.
    const why =
        status === 'ready'
            ? null
            : !trace.asked && tracks.length > 0 && empty
              ? reason('videoSpokenNeedsAi')
              : empty && !trace.asked
                ? reason('videoSpoken')
                : reasonFor(status, merged, trace, 'video');

    return outcome(status, merged, why, trace);
}

/** The subtitles as text, capped: a long video is not worth a whole book to a model. */
async function spokenText(tracks: ReturnType<typeof captionTracksFrom>): Promise<string> {
    const track = bestCaptionTrack(tracks);
    if (!track) return '';
    const fetched = await fetchPage(track.baseUrl);
    return fetched.ok ? captionText(fetched.html).slice(0, 24_000) : '';
}

/**
 * Instagram and TikTok: the post itself is behind a login, what it carries is
 * a caption, and the caption either is the recipe, points at it, or neither.
 *
 * Instagram's embed page gives the whole caption and the picture without an
 * account. The caption is then read by the rules; a link in it is followed;
 * and only then, if both fell short, may a model read it.
 */
async function processSocial(
    url: string,
    rawText: string | null,
    ai: AiCapability,
    options: ProcessOptions
): Promise<ProcessedCapture> {
    const code = instagramShortcode(url);
    const embed = code ? await fetchPage(instagramEmbedUrl(code)) : null;
    const post = embed?.ok ? readInstagramEmbed(embed.html) : null;

    const text = [rawText ?? '', post?.caption ?? ''].filter((part) => part.trim()).join('\n\n') || null;
    const finish = (result: ProcessedCapture): ProcessedCapture => {
        const pictured =
            result.draft && post?.imageUrl ? { ...result, draft: mergeDrafts(result.draft, { imageUrl: post.imageUrl }) } : result;
        if (pictured.status === 'ready') return pictured;

        // Not here, but the post says where: in the bio, in the comments, or
        // by DM. Said as such, with what works for each — see socialHints.
        const said = [text ?? '', pictured.draft?.title ?? '', pictured.draft?.description ?? ''].join('\n');
        const elsewhere = recipeElsewhere(said);
        const code = elsewhere === 'bio' ? 'recipeInBio' : elsewhere === 'comments' ? 'recipeInComments' : elsewhere === 'dm' ? 'recipeByDm' : null;
        return code ? { ...pictured, error: reason(code) } : pictured;
    };

    // The rules alone first, so that a link in the caption is tried before
    // anything is paid for.
    const byRules = await processWebPage(url, text, RULES_ONLY, { ...options, learnWith: undefined });
    if (byRules.status === 'ready' && !options.force) return finish(byRules);

    const linked = await fromLinkedRecipe(text ?? '', url, ai, options);
    if (linked?.draft) return finish(linked);

    // "pattyplates.com (link in bio)": the dish, searched for on that site —
    // or on the site this account named before.
    const handle = post?.author ? post.author.toLowerCase() : handleFromUrl(url);
    const account = handle ? { platform: code ? 'instagram' : 'tiktok', handle } : null;
    const onSite = await fromAuthorSite(text ?? '', account, url, ai, options);
    if (onSite?.draft) return finish(onSite);

    /*
     * The recipe is elsewhere — in the bio, the comments, a DM — and the
     * caption is not it: asking a model would be paying to be told so. Only
     * when somebody presses the button (`force`) is it asked anyway.
     */
    const promo = recipeElsewhere(text ?? '') !== null && (byRules.draft?.ingredients.length ?? 0) < 3;
    if (promo && !options.force) return finish(byRules);

    if (!canUseAi(ai)) return finish(byRules);
    return finish(await processWebPage(url, text, ai, options));
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
                reason('sharedTextUsed'),
                trace
            );
        }
        return outcome('failed', null, reason('pageUnreadable', page.failure));
    }

    const extracted = extractRecipeFromHtml(page.html, page.finalUrl);
    const shared = rawText ? withoutBareUrls(rawText) : '';
    const fromShare = shared ? parseRecipeText(shared) : null;
    let draft = fromShare ? mergeDrafts(extracted, fromShare) : extracted;

    /*
     * What we already know about this site.
     *
     * Only consulted when the rules fell short, and only ever merged into what
     * they found — the same rule the AI follows, for the same reason. A site's
     * JSON-LD, where it exists, is the site's own statement about its recipe
     * and beats anything inferred from headings.
     *
     * A profile that has been retired is not loaded at all; that is the store's
     * job, not this file's.
     */
    const host = hostOf(page.finalUrl);
    const store = options.profiles ?? NO_PROFILES;
    const known = host && shouldAsk(draft, options) ? await store.load(host) : null;
    let usedProfile = false;

    if (known && host) {
        const read = applyProfile(page.html, known.profile);
        const asRecipe = draftFromProfile(read, page.finalUrl);
        const merged = mergeDrafts(draft, asRecipe);

        /*
         * And the profile is still not believed.
         *
         * It was verified once, against one page of this site, possibly months
         * ago. Whether it worked *here* is decided by the same scoring every
         * other path answers to — and if the merged draft is no better than
         * what the rules had alone, the profile is not used and the failure is
         * recorded. Three of those and the site is re-learned.
         */
        if (damageOf(merged) < damageOf(draft)) {
            draft = merged;
            usedProfile = true;
        }
    }

    /*
     * The caption, read by the rules.
     *
     * Instagram, TikTok and Threads send a page with nothing in it — the body
     * is an empty mount point and the recipe is entirely in `og:title`. Until
     * now the only thing that could read it was a model, which made those
     * shares the one import that simply did not work without a key.
     *
     * But a great many of those captions are already written the way the rules
     * understand: a line of ingredients, the word Zutaten or Ingredients, a
     * couple of steps. `parseRecipeText` is the same parser that reads a shared
     * note, and pointing it at the caption costs nothing and needs no model.
     *
     * Deliberately not a site profile. A profile would have to be learned
     * first, which needs a key, on a site where the learning would fail anyway
     * for want of anything to anchor to. Meta tags are on every page from the
     * first request, so this works on the first import from a site nobody has
     * ever visited.
     *
     * The same rule as everything else here decides whether it is used: it has
     * to leave the draft *better* than it found it. A caption that is one
     * sentence of prose parses into something with no quantities and no
     * method, which scores worse, and is discarded.
     */
    if (shouldAsk(draft, options)) {
        const fromCaption = captionDraft(page.html, page.finalUrl);

        if (fromCaption) {
            const merged = mergeDrafts(draft, fromCaption);
            if (damageOf(merged) < damageOf(draft)) draft = merged;
        }
    }

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

    /*
     * Book-keeping, after the fact and never in the way of the answer.
     *
     * A profile that was used and still needed a model is a profile that is
     * drifting; three of those in a row and the site is marked for re-learning.
     * One is not — a site that serves a thin page once has not been redesigned,
     * and throwing away a mapping that has worked for months over a single bad
     * day would cost a model call to rebuild for nothing.
     */
    if (usedProfile && host) {
        await store
            .recordUse(host, !trace.asked && status === 'ready', trace.asked ? 'the profile left gaps a model had to fill' : undefined)
            .catch(() => undefined);
    }

    /*
     * And learning, which happens only when a model actually read the page and
     * actually helped. Learning from a failed call would store a map of a
     * recipe nobody found.
     */
    if (host && !known && options.learnWith && trace.asked && !trace.failed && status === 'ready') {
        await rememberThisSite(page.html, draft, host, page.finalUrl, options).catch(() => undefined);
    }

    const readBy: ProcessedCapture['readBy'] | undefined = usedProfile
        ? trace.asked
            ? 'profile+ai'
            : 'profile'
        : undefined;

    return outcome(status, draft, reasonFor(status, draft, trace, 'page'), trace, readBy);
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
/** What a picture path knows beyond the pictures: for following what they show. */
interface PictureContext {
    /** Further screenshots of the same share (a post and its comments). */
    more?: string[];
    /** What was shared with them, for the dish's name. */
    text?: string | null;
    /** The share's own address, which a found recipe is filed under. */
    sourceUrl?: string | null;
}

/** "pattyplates.com/corn" → "https://pattyplates.com/corn"; bare site names are kept as they are. */
function linkLines(links: string[]): { urls: string; sites: string } {
    const urls: string[] = [];
    const sites: string[] = [];
    for (const raw of links) {
        const link = raw.trim().replace(/[.,;)]+$/, '');
        if (/^https?:\/\//i.test(link)) urls.push(link);
        else if (/^[\w.-]+\.[a-z]{2,}\/\S+/i.test(link)) urls.push(`https://${link}`);
        else sites.push(link);
    }
    return { urls: urls.join('\n'), sites: sites.join(' ') };
}

async function processImage(
    imageUrl: string | null,
    ai: AiCapability,
    options: ProcessOptions,
    context: PictureContext = {}
): Promise<ProcessedCapture> {
    if (!imageUrl) {
        return outcome('failed', null, reason('noPicture'));
    }

    const withPicture = { ...emptyDraft(context.sourceUrl ?? ''), imageUrl };

    if (!canUseAi(ai)) {
        return outcome(
            'needsWork',
            withPicture,
            reason('pictureNeedsAi')
        );
    }

    const image = await fetchImageAsBase64(imageUrl);

    if (!image.ok) {
        return outcome(
            'needsWork',
            withPicture,
            reason('pictureUnreadable', image.failure)
        );
    }

    // The other screenshots of the same share, read in the same call. One
    // that cannot be fetched is left out rather than failing the rest.
    const more: { base64: string; mediaType: string }[] = [];
    for (const url of (context.more ?? []).slice(0, 3)) {
        const extra = await fetchImageAsBase64(url);
        if (extra.ok) more.push({ base64: extra.base64, mediaType: extra.mediaType });
    }

    try {
        const { links = [], ...parsed } = await extractRecipeWithAi(
            { kind: 'image', base64: image.base64, mediaType: image.mediaType, more },
            ai.keys,
            options.onModel
        );

        // The picture stays the draft's picture. A screenshot of an Instagram
        // post is a perfectly good photograph of the dish, and the alternative
        // is a recipe with no picture at all.
        const draft: ImportedRecipe = { ...withPicture, ...parsed, imageUrl };
        const status = completeness(draft);
        const trace = { provider: ai.keys[0]?.provider ?? null, asked: true, failed: false };

        /*
         * The screenshot shows where the recipe is rather than the recipe: a
         * link in a comment, "pattyplates.com" in a bio. Followed like a link
         * in a caption — the page read by the rules first — and searched for
         * on the site when it is only a name.
         */
        if (status !== 'ready' && links.length > 0) {
            const shared = context.sourceUrl ?? '';
            const { urls, sites } = linkLines(links);
            const linked = urls ? await fromLinkedRecipe(urls, shared, ai, options) : null;
            const found =
                linked ??
                (sites
                    ? await fromAuthorSite(`${draft.title || dishName(context.text ?? '')}\n${sites}`, null, shared, ai, options)
                    : null);
            if (found?.draft) {
                return { ...found, draft: mergeDrafts(found.draft, { imageUrl }), readBy: found.readBy === 'rules' ? 'ai' : found.readBy };
            }
        }

        // Always 'ai', never 'rules+ai': there were no rules here. A
        // photograph is the one source with nothing else to read it.
        return outcome(
            status,
            draft,
            status === 'ready' ? null : reason('picturePartial'),
            trace,
            'ai'
        );
    } catch (error) {
        // A missing key, a rate limit, a bad month at every provider. None of
        // it is worth losing the screenshot over.
        console.error('Reading a picture failed:', error);
        return outcome(
            'needsWork',
            withPicture,
            reason('pictureFailed'),
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
            return await processImage(capture.imageUrl ?? null, ai, options, { more: capture.moreImageUrls ?? [] });
        }

        if (capture.kind === 'text') {
            const text = withoutBareUrls(capture.rawText ?? '');
            if (text.trim() === '') {
                return outcome('failed', null, reason('nothingSent'));
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
                const fromPicture = await processImage(capture.imageUrl, ai, options, { more: capture.moreImageUrls ?? [], text });
                if (fromPicture.status === 'ready') return fromPicture;
            }

            return outcome(
                completeness(draft),
                draft,
                completeness(draft) === 'ready' ? null : reason('textPartial'),
                trace
            );
        }

        const url = capture.sourceUrl;
        if (!url) {
            return outcome('failed', null, reason('noLink'));
        }

        const source = capture.source as CaptureSource;
        const result =
            source === 'youtube'
                ? await processYoutube(url, capture.rawText, ai, options)
                : source === 'instagram' || source === 'tiktok'
                  ? await processSocial(url, capture.rawText, ai, options)
                  : await processWebPage(url, capture.rawText, ai, options);

        // The Instagram screenshot case, from the other side: the link could
        // not be read and the caption was not the recipe, but a picture came
        // with the share. Worth one more attempt before giving up.
        if (result.status !== 'ready' && capture.imageUrl) {
            const fromPicture = await processImage(capture.imageUrl, ai, options, {
                more: capture.moreImageUrls ?? [],
                text: [result.draft?.title ?? '', capture.rawText ?? ''].join('\n'),
                sourceUrl: url,
            });
            if (fromPicture.status === 'ready') return fromPicture;
        }

        return result;
    } catch (error) {
        // The raw capture is still in the database, so this is recoverable:
        // the inbox offers a retry once the cause is fixed.
        console.error('Capture processing error:', error);
        return outcome('failed', null, reason('somethingWrong'));
    }
}

/* -------------------------------------------------------------------------- */
/* What we have learned about a site                                           */
/* -------------------------------------------------------------------------- */

/**
 * Learns how this site is laid out, having just paid a model to read it.
 *
 * Deliberately the *last* thing that happens, after the capture's own answer is
 * settled, and wrapped by its caller so that a failure here can never affect
 * the import. Somebody sharing a recipe from their kitchen is owed their
 * recipe; whether the cookbook also got cleverer is nobody's business but ours.
 */
async function rememberThisSite(
    html: string,
    draft: ImportedRecipe,
    host: string,
    sourceUrl: string,
    options: ProcessOptions
): Promise<void> {
    const key = options.learnWith;
    const store = options.profiles;
    if (!key || !store) return;

    const learned = await learnSiteProfile(html, draft, key, (learnKey, system, text) =>
        completeWithKey(learnKey, { kind: 'raw', system, text }, options.onLearn)
    );
    if (!learned.profile) return;

    await store.save({
        host,
        profile: learned.profile,
        learnedFrom: sourceUrl,
        learnedBy: `${key.provider}${key.model ? `/${key.model}` : ''}`,
    });
}

/* -------------------------------------------------------------------------- */
/* The model alone                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Everything the share carries, as text: the page's words, the caption, the
 * video's title, description and subtitles, whatever was shared alongside.
 * Nothing is parsed and nothing learned is applied — this is the material,
 * not a reading of it. Also the picture that belongs with it.
 */
async function materialOf(capture: ProcessableCapture): Promise<{ text: string; imageUrl: string }> {
    const shared = withoutBareUrls(capture.rawText ?? '').trim();
    const url = capture.sourceUrl;
    if (capture.kind !== 'url' || !url) return { text: shared, imageUrl: '' };

    const source = capture.source as CaptureSource;

    if (source === 'youtube') {
        const videoId = youtubeVideoId(url);
        const page = videoId ? await fetchPage(url) : null;
        if (!videoId || !page?.ok) return { text: shared, imageUrl: '' };
        const video = extractYoutubePage(page.html, videoId);
        const spoken = await spokenText(captionTracksFrom(page.html));
        return {
            text: [video.title, video.description, shared, spoken ? `Gesprochen im Video / spoken in the video:\n${spoken}` : '']
                .filter((part) => part && part.trim())
                .join('\n\n'),
            imageUrl: video.imageUrl,
        };
    }

    if (source === 'instagram' || source === 'tiktok') {
        const code = instagramShortcode(url);
        const embed = code ? await fetchPage(instagramEmbedUrl(code)) : null;
        const post = embed?.ok ? readInstagramEmbed(embed.html) : null;
        if (post?.caption) {
            return { text: [post.caption, shared].filter(Boolean).join('\n\n'), imageUrl: post.imageUrl ?? '' };
        }
    }

    const page = await fetchPage(url);
    if (!page.ok) return { text: shared, imageUrl: '' };
    const meta = extractRecipeFromHtml(page.html, page.finalUrl);
    // The meta tags too: on a social page the whole post is in og:title.
    return {
        text: [readableText(page.html), meta.title, meta.description, shared].filter((part) => part && part.trim()).join('\n\n'),
        imageUrl: meta.imageUrl,
    };
}

/**
 * "Just read it": the model gets everything the share carries and makes the
 * recipe from it, start to finish.
 *
 * The normal path is rules first and a model filling their gaps, which is
 * right almost always and cheap — and wrong in the one case this is for: the
 * rules found something plausible-looking and the model is only allowed to
 * add to it. Here the rules, the learned site layouts and the merge are all
 * left out; the answer replaces the draft. One call, pressed by a person.
 */
export async function readWithAiOnly(
    capture: ProcessableCapture,
    ai: AiCapability,
    options: ProcessOptions = {}
): Promise<ProcessedCapture> {
    if (!canUseAi(ai)) return outcome('needsWork', null, reason('pictureNeedsAi'));
    if (capture.kind === 'image') return processImage(capture.imageUrl ?? null, ai, options, { more: capture.moreImageUrls ?? [] });

    try {
        const material = await materialOf(capture);
        const provider = ai.keys[0]?.provider ?? null;
        const text = material.text.slice(0, 60_000);

        if (text.trim().length >= 40) {
            try {
                const { links: _links, ...parsed } = await extractRecipeWithAi({ kind: 'text', text }, ai.keys, options.onModel);
                void _links;
                const draft: ImportedRecipe = {
                    ...emptyDraft(capture.sourceUrl ?? ''),
                    ...parsed,
                    imageUrl: material.imageUrl || capture.imageUrl || '',
                    sourceUrl: capture.sourceUrl ?? '',
                };
                const status = completeness(draft);
                if (status === 'ready' || !capture.imageUrl) {
                    const trace = { provider, asked: true, failed: false };
                    return outcome(status, draft, reasonFor(status, draft, trace, 'page'), trace, 'ai');
                }
            } catch (error) {
                console.error('Reading with the model alone failed:', error);
                if (!capture.imageUrl) {
                    return outcome('needsWork', null, reason('somethingWrong'), { provider, asked: true, failed: true }, 'rules+ai-failed');
                }
            }
        }

        // Nothing to read, or not enough in it: the screenshot, if one came.
        if (capture.imageUrl) return processImage(capture.imageUrl, ai, options, { more: capture.moreImageUrls ?? [], sourceUrl: capture.sourceUrl });
        return outcome('failed', null, reason('nothingSent'));
    } catch (error) {
        console.error('Capture processing error:', error);
        return outcome('failed', null, reason('somethingWrong'));
    }
}
