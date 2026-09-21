import { suite, equal, check } from './harness';
import { classifyCapture } from '../src/lib/capture';
import { processCapture } from '../src/lib/captureProcess';

/**
 * The whole way through: what a share sheet sends, to a recipe draft.
 *
 * The network is stubbed rather than reached — these assert how this code
 * handles a page, not that YouTube is up. The YouTube fixture matches the
 * structure of a watch page (see youtube.test.ts for the caveat on that).
 */

type Fetch = typeof globalThis.fetch;

function stubFetch(pages: Record<string, { html: string; status?: number }>): () => void {
    const original = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        const page = pages[url];

        if (!page) {
            return {
                ok: false,
                status: 404,
                url,
                headers: new Headers({ 'content-type': 'text/html' }),
                text: async () => '',
            } as Response;
        }

        return {
            ok: (page.status ?? 200) < 400,
            status: page.status ?? 200,
            url,
            headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
            text: async () => page.html,
        } as Response;
    }) as Fetch;

    return () => {
        globalThis.fetch = original;
    };
}

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
