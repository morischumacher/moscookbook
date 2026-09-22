import { suite, equal, check } from './harness';
import { classifyCapture } from '../src/lib/capture';
import { processCapture } from '../src/lib/captureProcess';
import type { AiCapability, AiKey } from '../src/lib/aiImport';

/**
 * The whole way through: what a share sheet sends, to a recipe draft.
 *
 * The network is stubbed rather than reached — these assert how this code
 * handles a page, not that YouTube is up. The YouTube fixture matches the
 * structure of a watch page (see youtube.test.ts for the caveat on that).
 */

import { stubFetch } from './stubFetch';

type Fetch = typeof globalThis.fetch;

const YOUTUBE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:image" content="https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg">
</head><body><script>var r = {"videoDetails":{"videoId":"abcdefghijk","title":"K\\u00e4sesp\\u00e4tzle","shortDescription":"Zutaten:\\n400 g Sp\\u00e4tzle\\n200 g Bergk\\u00e4se\\n2 Zwiebeln\\n\\nZubereitung:\\nZwiebeln goldbraun r\\u00f6sten.\\nAlles schichten und servieren.","isOwnerViewing":false}};</script></body></html>`;

const SILENT_VIDEO_HTML = `<!DOCTYPE html><html><body><script>var r = {"videoDetails":{"videoId":"abcdefghijk","title":"Das beste Curry","shortDescription":"Viel Spa\\u00df beim Nachkochen!\\n\\n0:00 Intro\\nAbonniert den Kanal","isOwnerViewing":false}};</script></body></html>`;

export default async function captureProcessTests() {
    suite('processCapture — shared text');

    const note = classifyCapture({
        text: 'Omas Apfelkuchen\n\nZutaten\n200 g Mehl\n100 g Zucker\n3 Eier\n\nZubereitung\nAlles verrühren und backen.',
    });

    const fromNote = await processCapture(note!);

    equal('a complete pasted recipe is ready to publish', fromNote.status, 'ready');
    equal('takes the title from the first line', fromNote.draft?.title, 'Omas Apfelkuchen');
    equal('finds every ingredient', fromNote.draft?.ingredients.length, 3);
    check(
        'keeps the method',
        (fromNote.draft?.instructions ?? '').includes('verrühren'),
        fromNote.draft?.instructions
    );

    const scrap = await processCapture(classifyCapture({ text: 'Unbedingt mal Risotto machen' })!);
    equal('a stray thought is not a finished recipe', scrap.status, 'needsWork');
    check('but it is kept, not thrown away', scrap.draft !== null, scrap.draft);

    suite('processCapture — YouTube');

    let restore = stubFetch({ 'https://www.youtube.com/watch?v=abcdefghijk': { html: YOUTUBE_HTML } });

    const video = await processCapture(
        classifyCapture({ text: 'https://www.youtube.com/watch?v=abcdefghijk' })!
    );

    equal('a description holding a recipe is ready', video.status, 'ready');
    equal('uses the video title', video.draft?.title, 'Käsespätzle');
    equal('reads the ingredients out of the description', video.draft?.ingredients.length, 3);
    equal(
        'takes the thumbnail as the picture',
        video.draft?.imageUrl,
        'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg'
    );
    equal('remembers where it came from', video.draft?.sourceUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
    restore();

    restore = stubFetch({ 'https://www.youtube.com/watch?v=abcdefghijk': { html: SILENT_VIDEO_HTML } });

    const silent = await processCapture(
        classifyCapture({ text: 'https://www.youtube.com/watch?v=abcdefghijk' })!
    );

    equal('a video whose recipe is only spoken needs a minute', silent.status, 'needsWork');
    equal('but the title is still there to work from', silent.draft?.title, 'Das beste Curry');
    check('and it says why', (silent.error ?? '').length > 0, silent.error);
    restore();

    suite('processCapture — a page that cannot be read');

    // This is the Instagram case, and the reason the caption is kept: the page
    // refuses the request, and the shared text is the whole recipe.
    restore = stubFetch({});

    const instagram = await processCapture(
        classifyCapture({
            text: 'https://www.instagram.com/p/abc/\n\nSpaghetti Aglio e Olio\n\nZutaten\n400 g Spaghetti\n4 Knoblauchzehen\n1 Chili\n\nZubereitung\nKnoblauch in Öl anbraten und mit den Nudeln mischen.',
        })!
    );

    equal('falls back to the caption and gets a whole recipe', instagram.status, 'ready');
    equal('with the right title', instagram.draft?.title, 'Spaghetti Aglio e Olio');
    equal('and its ingredients', instagram.draft?.ingredients.length, 3);
    check(
        'while saying the page itself could not be read',
        (instagram.error ?? '').includes('could not be read'),
        instagram.error
    );

    const bare = await processCapture(
        classifyCapture({ url: 'https://example.com/rezept' })!
    );
    equal('a dead link with nothing else is a failure', bare.status, 'failed');
    equal('and has no draft to show', bare.draft, null);
    restore();

    suite('processCapture — never throws');

    const image = await processCapture({
        kind: 'image',
        source: 'photo',
        sourceUrl: null,
        rawText: null,
        imageUrl: 'https://example.com/photo.jpg',
    });
    equal('a photograph waits for a human rather than failing', image.status, 'needsWork');

    const nothing = await processCapture({
        kind: 'text',
        source: 'note',
        sourceUrl: null,
        rawText: '   ',
    });
    equal('an empty capture fails cleanly', nothing.status, 'failed');
}

/* -------------------------------------------------------------------------- */
/*  What we have learned about a site                                          */
/* -------------------------------------------------------------------------- */

/**
 * A profile is the one path where the cookbook follows an instruction written
 * weeks ago, by a model, about a page nobody has looked at since. So these
 * checks are less about it working than about the three ways it is kept
 * honest: it is only used when it beats the rules, it is only trusted when the
 * scoring agrees, and the capture says plainly that no model was involved.
 */
export async function siteProfilePipelineTests() {
    suite('processCapture — a learned site');

    // A page with no structured data at all: the rules get a title and a
    // picture and nothing else, which is precisely the gap profiles exist for.
    const BLOG = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Linsensuppe">
<meta property="og:image" content="https://example.com/soup.jpg">
<script type="application/ld+json">{"@type":"BlogPosting","headline":"Linsensuppe"}</script>
</head><body>
<h1>Linsensuppe</h1>
<h2>Zutaten</h2>
<ul><li>250 g rote Linsen</li><li>1 Karotte</li><li>1 Zwiebel</li><li>1 EL Olivenöl</li></ul>
<h2>Zubereitung</h2>
<p>Zwiebel und Karotte würfeln und im Öl glasig dünsten.</p>
<p>Linsen zugeben, mit Wasser aufgießen und zwanzig Minuten köcheln lassen.</p>
<h2>Das könnte dir auch schmecken</h2>
<ul><li>Kürbissuppe</li><li>Tomatensuppe</li></ul>
</body></html>`;

    const url = 'https://kochblog.example/linsensuppe';
    const stored = {
        host: 'kochblog.example',
        profile: {
            title: { kind: 'meta', property: 'og:title' },
            ingredients: { kind: 'listAfterHeading', heading: 'Zutaten' },
            method: { kind: 'textAfterHeading', heading: 'Zubereitung' },
        },
        learnedFrom: url,
        learnedBy: 'anthropic/claude-sonnet-5',
        learnedAt: new Date(),
        failures: 0,
        stale: false,
    } as const;

    /** A store that records what was asked of it, so the book-keeping can be seen. */
    function storeWith(profile: typeof stored | null) {
        const uses: Array<{ host: string; ok: boolean }> = [];
        const saved: Array<{ host: string }> = [];
        return {
            uses,
            saved,
            store: {
                load: async () => profile,
                save: async (input: { host: string }) => {
                    saved.push({ host: input.host });
                },
                recordUse: async (host: string, ok: boolean) => {
                    uses.push({ host, ok });
                },
            },
        };
    }

    const restore = stubFetch({ [url]: { html: BLOG } });

    try {
        const plain = classifyCapture({ url })!;

        // Without a profile and without a key: the rules alone, which is the
        // situation that made this whole feature worth building.
        const bare = await processCapture(plain, { mode: 'off', keys: [] });
        check('with nothing learned, the rules find no ingredients', bare.draft?.ingredients.length === 0, bare.draft?.ingredients);
        equal('and say so', bare.readBy, 'rules');

        // With a profile, the same page, still no key.
        const known = storeWith(stored);
        const read = await processCapture(plain, { mode: 'off', keys: [] }, { profiles: known.store });

        check('a learned site is read without a model', read.draft?.ingredients.length === 4, read.draft?.ingredients);
        check('and the method comes with it', (read.draft?.instructions ?? '').includes('köcheln'), read.draft?.instructions);
        equal('the capture says a profile was used', read.readBy, 'profile');

        /*
         * The label is the point. He asked that it always be clear whether a
         * model wrote a recipe, and a profile is the case where the honest
         * answer is "no, but one did once, weeks ago".
         */
        equal('and names no provider, because none answered', read.provider, null);
        equal('the site is credited with a good read', known.uses[0]?.ok, true);

        // The related-recipes list sits under its own heading two blocks down.
        check(
            'the wrong list is not swept up',
            !(read.draft?.ingredients ?? []).some((i) => i.item.includes('Kürbis')),
            read.draft?.ingredients
        );

        /*
         * A profile pointing at headings this page does not have must not make
         * the draft worse than the rules managed on their own. It is compared
         * against what it would replace, and loses.
         */
        const wrong = storeWith({
            ...stored,
            profile: {
                title: { kind: 'meta', property: 'og:title' },
                ingredients: { kind: 'listAfterHeading', heading: 'Ingredients' },
                method: { kind: 'textAfterHeading', heading: 'Method' },
            },
        } as unknown as typeof stored);

        const missed = await processCapture(plain, { mode: 'off', keys: [] }, { profiles: wrong.store });
        equal('a profile that finds nothing is not used', missed.readBy, 'rules');
        check('and the draft is what the rules had', missed.draft?.ingredients.length === 0, missed.draft?.ingredients);

        /*
         * Nothing may depend on the table existing. This is the shape the
         * pipeline is in on a checkout that has merged the branch but not run
         * `prisma generate`, and it has to be indistinguishable from a site
         * nothing has been learned about.
         */
        const noTable = await processCapture(plain, { mode: 'off', keys: [] }, {
            profiles: { load: async () => null, save: async () => {}, recordUse: async () => {} },
        });
        equal('with no profiles at all, nothing changes', noTable.readBy, 'rules');

    } finally {
        restore();
    }

    /* ------------------------------------------------------------- learning */

    /*
     * The first version of this check was worthless and the sabotage run said
     * so: it ran with the AI switched off, so the pipeline never reached the
     * learning branch at all and the check would have passed with the entire
     * feature deleted. A test that cannot fail is worse than no test, because
     * it is counted.
     *
     * So this one actually drives a model. Two calls go out — the recipe, then
     * the profile — and the stub answers them in order.
     */
    suite('processCapture — learning a new site');

    const RECIPE_ANSWER = {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    title: 'Linsensuppe',
                    description: '',
                    category: '',
                    nationality: '',
                    servings: null,
                    prepMinutes: null,
                    cookMinutes: null,
                    ingredients: [
                        { amount: '250 g', item: 'rote Linsen' },
                        { amount: '1', item: 'Karotte' },
                        { amount: '1', item: 'Zwiebel' },
                        { amount: '1 EL', item: 'Olivenöl' },
                    ],
                    instructions:
                        'Zwiebel und Karotte würfeln und im Öl glasig dünsten.\n\n' +
                        'Linsen zugeben, mit Wasser aufgießen und zwanzig Minuten köcheln lassen.',
                }),
            },
        ],
    };

    const PROFILE_ANSWER = {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    title: { kind: 'meta', property: 'og:title' },
                    image: { kind: 'meta', property: 'og:image' },
                    ingredients: { kind: 'listAfterHeading', heading: 'Zutaten' },
                    method: { kind: 'textAfterHeading', heading: 'Zubereitung' },
                }),
            },
        ],
    };

    /**
     * Answers the provider's endpoint differently on each call, in order, and
     * counts the calls.
     *
     * The count is the point of half the checks below. Two of the guards on
     * learning are backed up by the verification step, so removing them changes
     * no recipe — they exist to stop a *second billed call* going out for an
     * answer that is going to be thrown away. Nothing but a call count can see
     * that, and a guard nothing can see is a guard that gets deleted.
     */
    const asks = { count: 0 };

    function stubConversation(html: string, answers: unknown[]): () => void {
        const original = globalThis.fetch;
        let asked = 0;
        asks.count = 0;

        globalThis.fetch = (async (input: string | URL | Request) => {
            const at = typeof input === 'string' ? input : input.toString();

            if (at.includes('api.anthropic.com')) {
                const answer = answers[Math.min(asked, answers.length - 1)];
                asked += 1;
                asks.count += 1;
                return {
                    ok: true,
                    status: 200,
                    url: at,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    text: async () => JSON.stringify(answer),
                    json: async () => answer,
                } as unknown as Response;
            }

            return {
                ok: at === url,
                status: at === url ? 200 : 404,
                url: at,
                headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
                text: async () => (at === url ? html : ''),
                json: async () => ({}),
            } as unknown as Response;
        }) as Fetch;

        return () => {
            globalThis.fetch = original;
        };
    }

    const key: AiKey = { provider: 'anthropic', apiKey: 'test', model: null };
    const withAi: AiCapability = { mode: 'always', keys: [key] };
    const capture = classifyCapture({ url })!;

    let close = stubConversation(BLOG, [RECIPE_ANSWER, PROFILE_ANSWER]);
    try {
        const fresh = storeWith(null);
        const first = await processCapture(capture, withAi, {
            profiles: fresh.store,
            learnWith: key,
        });

        equal('the first import from an unknown site uses the model', first.readBy, 'rules+ai');
        equal('and produces a recipe', first.status, 'ready');
        equal('the site is learned', fresh.saved.length, 1);
        equal('which took a second call to the model', asks.count, 2);
        equal('under its hostname without www', fresh.saved[0]?.host, 'kochblog.example');

        /*
         * And the guard that the sabotage run found unpinned: learning is
         * never a side effect of an import. Without a key handed over for the
         * purpose, the same run reads the page and remembers nothing.
         */
        const unasked = storeWith(null);
        close();
        close = stubConversation(BLOG, [RECIPE_ANSWER, PROFILE_ANSWER]);
        await processCapture(capture, withAi, { profiles: unasked.store });
        equal('no key for learning, nothing learned', unasked.saved.length, 0);
        equal('and no second call was paid for', asks.count, 1);

        /*
         * Nor is a profile learned from a page the model could not read. A map
         * of a recipe nobody found is worse than no map.
         */
        const failed = storeWith(null);
        close();
        /*
         * The profile answer is offered as the second reply on purpose. If the
         * guard on "the model actually helped" were removed, learning would
         * proceed from here and a profile *would* be saved — so this check can
         * fail, which the first version of it could not.
         */
        close = stubConversation(BLOG, [
            { content: [{ type: 'text', text: 'I could not find a recipe.' }] },
            PROFILE_ANSWER,
        ]);
        await processCapture(capture, withAi, { profiles: failed.store, learnWith: key });
        equal('a failed read teaches nothing', failed.saved.length, 0);
        equal('and is not asked about either', asks.count, 1);
    } finally {
        close();
    }
}


/* -------------------------------------------------------------------------- */
/*  A page with nothing in it but a caption                                    */
/* -------------------------------------------------------------------------- */

/**
 * Instagram, TikTok, Threads.
 *
 * The page body is an empty mount point; the whole recipe is in `og:title`.
 * These were the one import that did not work at all without a key, and a
 * great many of those captions are already written the way the rules
 * understand.
 *
 * The check that matters is not the one where it works. It is the one where a
 * caption is a joke and a link, and the parser dutifully turns it into
 * something — a draft with an "ingredient" that is a sentence. Left in, that
 * is a recipe in the cookbook that reads like a recipe and is not one, which
 * is the failure nothing downstream can detect.
 */
export async function captionTests() {
    suite('processCapture — a page that is only a caption');

    const shell = (caption: string, description = '') => `<!DOCTYPE html><html><head>
<meta property="og:title" content="${caption}">
${description ? `<meta property="og:description" content="${description}">` : ''}
<meta property="og:image" content="https://instagram.example/p.jpg">
</head><body><div id="mount"></div></body></html>`;

    const REEL = 'https://www.instagram.com/reel/abc123/';

    /*
     * `&#10;` rather than a newline, because that is how a newline survives an
     * HTML attribute — and getting this wrong is the whole reason the first
     * version of this feature did not work. `metaContent` collapses all
     * whitespace, which is right for a title and destroys a caption: the
     * parser is line-based, so a flattened ingredient list parses to nothing.
     * The first draft of this test had the caption as one sentence with
     * commas, which is not how anybody writes one, and it hid the bug by
     * failing for the wrong reason.
     */
    const nl = '&#10;';
    const recipeCaption =
        `Ben Slater auf Instagram: «Creamy tomato pasta.${nl}${nl}` +
        `Zutaten:${nl}400 g Spaghetti${nl}2 Dosen Tomaten${nl}200 g Sahne${nl}3 Zehen Knoblauch${nl}50 g Parmesan${nl}${nl}` +
        `Zubereitung:${nl}Knoblauch in Öl anschwitzen.${nl}Tomaten zugeben und 15 Minuten einkochen.${nl}` +
        `Sahne unterrühren und die Nudeln untermischen.${nl}Mit Parmesan servieren.»`;

    let restore = stubFetch({ [REEL]: { html: shell(recipeCaption) } });

    try {
        const capture = classifyCapture({ url: REEL })!;
        const read = await processCapture(capture, { mode: 'off', keys: [] });

        check('a caption with a recipe in it is read', (read.draft?.ingredients.length ?? 0) >= 4, read.draft?.ingredients);
        check('with quantities', read.draft?.ingredients.some((i) => i.amount.includes('400')), read.draft?.ingredients);
        check('and the method', (read.draft?.instructions ?? '').includes('einkochen'), read.draft?.instructions);
        check('the picture comes along', read.draft?.imageUrl === 'https://instagram.example/p.jpg', read.draft?.imageUrl);

        // No model was involved, and the capture must not suggest otherwise.
        equal('no model was asked', read.readBy, 'rules');
        equal('and none is named', read.provider, null);

        // The author and the platform are not part of the recipe.
        check(
            'the platform wrapper does not become an ingredient',
            !(read.draft?.ingredients ?? []).some((i) => i.item.includes('Slater')),
            read.draft?.ingredients
        );
    } finally {
        restore();
    }

    /*
     * The one that matters. A caption that is a sentence and a link parses
     * into something, and that something must be thrown away — it can only
     * make the draft worse, and a draft that is worse but complete-looking is
     * the one outcome the scoring exists to prevent.
     */
    const chatter =
        'Ben Slater auf Instagram: «POV: you have twenty minutes and exactly one pan and absolutely ' +
        'no intention of washing up afterwards. Full recipe is in my newsletter, link in bio, ' +
        'go and get it before I take it down again like last time.»';

    restore = stubFetch({ [REEL]: { html: shell(chatter) } });

    try {
        const capture = classifyCapture({ url: REEL })!;
        const read = await processCapture(capture, { mode: 'off', keys: [] });

        check(
            'a caption with no recipe in it produces no ingredients',
            (read.draft?.ingredients.length ?? 0) === 0,
            read.draft?.ingredients
        );
        /*
         * And the prose does not become the method either.
         *
         * This one is not load-bearing and the probe says so: this caption is
         * rejected outright by the emptiness guard, because `parseRecipeText`
         * finds neither a list nor a method in a single paragraph of joke. It
         * is here to pin the outcome by whichever mechanism holds it — the
         * blog case at the end of this file is where the guard that had to be
         * added is the thing doing the work.
         */
        check(
            'and its prose does not become the method',
            (read.draft?.instructions ?? '') === '',
            read.draft?.instructions
        );
        check('and nothing is published as ready', read.status !== 'ready', read.status);
    } finally {
        restore();
    }

    /* --------------------------------------------------------- the split one */

    // Some platforms put half the caption in each tag, and the two together
    // are the caption.
    restore = stubFetch({
        [REEL]: {
            html: shell(
                `Ben Slater auf Instagram: «Linsensuppe${nl}${nl}Zutaten:${nl}250 g rote Linsen${nl}1 Karotte${nl}1 Zwiebel${nl}1 EL Olivenöl»`,
                `Zubereitung:${nl}Zwiebel und Karotte würfeln und anschwitzen.${nl}Linsen zugeben, aufgießen und zwanzig Minuten köcheln.`
            ),
        },
    });

    try {
        const capture = classifyCapture({ url: REEL })!;
        const read = await processCapture(capture, { mode: 'off', keys: [] });

        check('a caption split across two tags is read as one', (read.draft?.ingredients.length ?? 0) >= 3, read.draft?.ingredients);
        check('including the half in the description', (read.draft?.instructions ?? '').includes('köcheln'), read.draft?.instructions);
    } finally {
        restore();
    }

    /* ----------------------------------------------------- the guard, properly */

    /*
     * The three checks below exist because the sabotage run found the first
     * versions of them worthless: deleting the damage comparison, the length
     * floor and the wrapper stripping each changed nothing any test could see.
     *
     * The reason was the same every time — the caption I had written was
     * either obviously good or obviously empty, and both of those take the
     * same path whether the guard is there or not. A guard is only tested by
     * the case that sits on its edge.
     */

    // Parses into something, and that something is no better than nothing:
    // three ingredients with no quantities and no method scores exactly what
    // an empty draft scores, so it must be discarded.
    const junkCaption =
        `Ben Slater auf Instagram: «Mein Sonntag${nl}${nl}` +
        `Zutaten:${nl}Liebe${nl}Geduld${nl}ein sehr gutes Gespräch${nl}Zeit und noch mehr Zeit»`;

    restore = stubFetch({ [REEL]: { html: shell(junkCaption) } });

    try {
        const capture = classifyCapture({ url: REEL })!;
        const read = await processCapture(capture, { mode: 'off', keys: [] });

        check(
            'a caption that parses into something no better is thrown away',
            (read.draft?.ingredients.length ?? 0) === 0,
            read.draft?.ingredients
        );
    } finally {
        restore();
    }

    /*
     * Thirty-six characters, and a real recipe.
     *
     * This one killed the length floor. It was 120 at first, then 40, and both
     * numbers threw this away — two ingredients with real quantities — because
     * both were guesses about how much text a recipe needs. The damage
     * comparison measures instead, so the floor is gone and this is the check
     * that keeps it gone.
     */
    restore = stubFetch({
        [REEL]: { html: shell(`Ben Slater auf Instagram: «Pasta${nl}${nl}Zutaten:${nl}400 g Nudeln${nl}2 EL Öl»`) },
    });

    try {
        const capture = classifyCapture({ url: REEL })!;
        const read = await processCapture(capture, { mode: 'off', keys: [] });
        check(
            'a short caption with a real list in it is kept',
            (read.draft?.ingredients.length ?? 0) === 2,
            read.draft?.ingredients
        );
    } finally {
        restore();
    }

    restore = stubFetch({ [REEL]: { html: shell('Ben Slater auf Instagram: «Pasta.»') } });

    try {
        const capture = classifyCapture({ url: REEL })!;
        const read = await processCapture(capture, { mode: 'off', keys: [] });
        check(
            'a caption with nothing in it still yields nothing',
            (read.draft?.ingredients.length ?? 0) === 0,
            read.draft
        );
    } finally {
        restore();
    }

    // What stripping the wrapper actually buys: the closing quotation mark not
    // being glued to the last step of the method.
    restore = stubFetch({ [REEL]: { html: shell(recipeCaption) } });

    try {
        const capture = classifyCapture({ url: REEL })!;
        const read = await processCapture(capture, { mode: 'off', keys: [] });
        check(
            'the wrapper\'s closing quote does not end up in the method',
            !(read.draft?.instructions ?? '').includes('»'),
            read.draft?.instructions
        );
    } finally {
        restore();
    }

    /* ------------------------------------- a blog, which is not a platform */

    /*
     * The caption reader runs on every page, not only on the platforms it was
     * written for, and every page on the web has an `og:description`.
     *
     * On a recipe blog that description is a sentence of marketing, and
     * `parseRecipeText` — which has to put text somewhere — handed it back as
     * `instructions`. Eighty characters that scored like a method, so the
     * caption was merged; and once the method was no longer a hole, the model
     * reading the actual page had its answer thrown away by `mergeDrafts`.
     * The recipe came back with the site's slogan where the method belonged.
     *
     * Found by the transcript suite, which replays real imports: a recording
     * with 3654 characters of method replayed to 84. This is that page, made
     * small, and it drives the whole chain — caption, score, model, merge —
     * because every part of it was behaving reasonably on its own.
     */
    const BLOG_URL = 'https://blog.example/recipes/fried-chicken-sandwich';
    const SLOGAN = 'The crispiest fried chicken sandwich you will ever make at home, no deep fryer.';
    const BLOG_PAGE = `<!DOCTYPE html><html><head>
<title>Perfect Fried Chicken Sandwich</title>
<meta property="og:title" content="Perfect Fried Chicken Sandwich">
<meta property="og:description" content="${SLOGAN}">
<meta property="og:image" content="https://blog.example/a.jpg">
</head><body><article><h1>Perfect Fried Chicken Sandwich</h1>
<ul><li>2 lb chicken thighs</li><li>1 cup flour</li><li>1 tbsp salt</li><li>2 cups buttermilk</li></ul>
${Array.from({ length: 12 }, (_, i) => `<p>Step ${i + 1}. Keep everything cold and well seasoned until the texture is right.</p>`).join('\n')}
</article></body></html>`;

    const MODEL_METHOD = Array.from(
        { length: 12 },
        (_, i) => `${i + 1}. Keep everything cold and well seasoned until the texture is right.`
    ).join('\n');

    const BLOG_ANSWER = {
        content: [{ type: 'text', text: JSON.stringify({
            title: 'Perfect Fried Chicken Sandwich',
            description: '', category: '', nationality: '',
            servings: null, prepMinutes: null, cookMinutes: null,
            ingredients: [
                { amount: '2 lb', item: 'chicken thighs' },
                { amount: '1 cup', item: 'flour' },
                { amount: '1 tbsp', item: 'salt' },
                { amount: '2 cups', item: 'buttermilk' },
            ],
            instructions: MODEL_METHOD,
        }) }],
    };

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
        const at = typeof input === 'string' ? input : input.toString();
        if (at.includes('api.anthropic.com')) {
            return {
                ok: true, status: 200, url: at,
                headers: new Headers({ 'content-type': 'application/json' }),
                text: async () => JSON.stringify(BLOG_ANSWER),
                json: async () => BLOG_ANSWER,
            } as unknown as Response;
        }
        return {
            ok: at === BLOG_URL, status: at === BLOG_URL ? 200 : 404, url: at,
            headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
            text: async () => (at === BLOG_URL ? BLOG_PAGE : ''),
            json: async () => ({}),
        } as unknown as Response;
    }) as typeof globalThis.fetch;

    try {
        const blogKey: AiKey = { provider: 'anthropic', apiKey: 'test', model: null };
        const read = await processCapture(
            classifyCapture({ text: BLOG_URL })!,
            { mode: 'always', keys: [blogKey] }
        );

        check(
            'a blog\'s slogan never becomes its method',
            !(read.draft?.instructions ?? '').includes('crispiest'),
            read.draft?.instructions
        );
        check(
            'the model\'s reading of the page survives the merge',
            (read.draft?.instructions ?? '').length > SLOGAN.length * 3,
            `${(read.draft?.instructions ?? '').length} characters`
        );
        equal('and the recipe is complete', read.draft?.ingredients.length, 4);
    } finally {
        globalThis.fetch = realFetch;
    }
}
