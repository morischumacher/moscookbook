import { suite, equal, check } from './harness';
import { stubFetch } from './stubFetch';
import { captureInputFrom } from '../src/lib/captureInput';
import { processCapture } from '../src/lib/captureProcess';
import { captureLabel } from '../src/lib/capture';
import type { ImportedRecipe } from '../src/lib/recipeFromHtml';

/**
 * Every way a recipe can get into this cookbook, driven end to end.
 *
 * Each case starts from the payload a real device sends — the JSON body an iOS
 * Shortcut posts, the body the mail bridge posts — and ends at the draft that
 * lands in the inbox. Nothing between is stubbed except the network itself.
 *
 * That boundary is the point. `captureProcess.test.ts` already covers the
 * parser; what is checked here is the joining, which is where the two bugs of
 * the last round lived: a YouTube recipe called "Viel Spaß beim Nachkochen!",
 * and an Instagram recipe named after its own URL. Both parsers were fine on
 * their own.
 *
 * Where the fixtures come from: they are written by hand from the shape of the
 * real thing, because nothing outside this container is reachable. The two that
 * deserve suspicion are the YouTube watch page and the Instagram block — see
 * the notes at each. Run `npm run fixtures -- <url>` against the real sites to
 * replace them.
 */

/** What an iOS Shortcut posts from the share sheet. */
async function share(body: {
    url?: string;
    text?: string;
    note?: string;
    via?: 'email';
    subject?: string;
    /** Already stored by the route by the time the pipeline sees it. */
    imageUrl?: string;
    /**
     * A picture as it actually arrives: base64, not yet stored.
     *
     * This field is the whole point of the regression suite at the bottom of
     * this file. Every image test here used to pass `imageUrl` — the shape the
     * *classifier* takes — and none used the shape an iOS Shortcut *posts*, so
     * a bug that rejected every screenshot capture outright passed a hundred
     * checks on its way to somebody's phone.
     */
    image?: { base64: string; mediaType: string };
}) {
    const classified = captureInputFrom(body);
    if (!classified) return { classified: null, result: null };

    // What the route does between classifying and processing: the picture is
    // stored, and the address is put back on the classified capture.
    const stored = body.image ? 'https://blob.example/capture_1.jpg' : undefined;

    return {
        classified,
        result: await processCapture({
            ...classified,
            imageUrl: stored ?? classified.imageUrl,
        }),
    };
}

function ingredientNames(draft: ImportedRecipe | null | undefined): string[] {
    return (draft?.ingredients ?? []).map((line) => String(line));
}

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A watch page, reduced to the two things the extractor reads: the og:image and
 * the `videoDetails` object. The real page is two megabytes of script around
 * exactly this.
 */
const YOUTUBE = `<!DOCTYPE html><html><head>
<meta property="og:image" content="https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg">
<title>Linsensuppe - YouTube</title>
</head><body><script>var ytInitialPlayerResponse = {"streamingData":{},"videoDetails":{"videoId":"dQw4w9WgXcQ","title":"Die beste Linsensuppe","lengthSeconds":"612","shortDescription":"Meine Lieblingssuppe f\\u00fcr kalte Tage.\\n\\nZutaten:\\n250 g rote Linsen\\n1 Zwiebel\\n2 Karotten\\n1 EL Tomatenmark\\n1 l Gem\\u00fcsebr\\u00fche\\n\\nZubereitung:\\nZwiebel und Karotten w\\u00fcrfeln und anschwitzen.\\nTomatenmark kurz mitr\\u00f6sten.\\nLinsen und Br\\u00fche zugeben, 20 Minuten k\\u00f6cheln.\\nMit Salz und Zitrone abschmecken.\\n\\n---\\nAbonniert den Kanal f\\u00fcr mehr Rezepte!\\nInstagram: @beispiel\\n#suppe #linsen","isOwnerViewing":false,"isCrawlable":true}};</script></body></html>`;

/** A recipe site that does it properly: schema.org/Recipe in a JSON-LD block. */
const BLOG = `<!DOCTYPE html><html lang="de"><head>
<meta property="og:image" content="https://kochblog.example/bilder/kuchen.jpg">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Zwetschgenkuchen vom Blech",
  "description": "Der Kuchen, den es bei uns jeden September gibt.",
  "recipeYield": "12 Stücke",
  "prepTime": "PT30M",
  "cookTime": "PT45M",
  "recipeCategory": "Dessert",
  "recipeCuisine": "Deutsch",
  "recipeIngredient": ["1 kg Zwetschgen", "300 g Mehl", "150 g Zucker", "1 Päckchen Trockenhefe", "125 ml Milch"],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Hefeteig ansetzen und eine Stunde gehen lassen."},
    {"@type": "HowToStep", "text": "Zwetschgen entsteinen und vierteln."},
    {"@type": "HowToStep", "text": "Teig ausrollen, belegen und 45 Minuten backen."}
  ]
}
</script></head><body><h1>Zwetschgenkuchen vom Blech</h1></body></html>`;

export default async function channelTests() {
    // ── 1. The share sheet on a YouTube video ───────────────────────────────
    suite('channel: YouTube, shared from the app');

    let restore = stubFetch({ 'https://youtu.be/dQw4w9WgXcQ': { html: YOUTUBE } });

    // The iOS share sheet gives youtu.be links, not youtube.com/watch ones.
    const video = await share({ url: 'https://youtu.be/dQw4w9WgXcQ' });

    equal('is recognised as YouTube', video.classified?.source, 'youtube');
    equal('a description holding a recipe comes out ready', video.result?.status, 'ready');
    equal("takes the video's own title", video.result?.draft?.title, 'Die beste Linsensuppe');
    equal('finds every ingredient', video.result?.draft?.ingredients.length, 5);
    equal(
        'keeps the thumbnail',
        video.result?.draft?.imageUrl,
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    );
    // The subscribe plea and the hashtags are not part of the method.
    check(
        'strips the channel boilerplate out of the method',
        !(video.result?.draft?.instructions ?? '').toLowerCase().includes('abonniert'),
        video.result?.draft?.instructions
    );
    check(
        'strips the hashtags',
        !(video.result?.draft?.instructions ?? '').includes('#suppe'),
        video.result?.draft?.instructions
    );
    restore();

    // ── 2. Instagram, which does not let us read the page ───────────────────
    suite('channel: Instagram, caption only');

    // No entry in the stub: Instagram answers a reader with a login wall, and
    // from here that is indistinguishable from a 404. The caption the share
    // sheet carries is the whole recipe, which is why it is kept.
    restore = stubFetch({});

    const insta = await share({
        text: `Ofengemüse mit Feta 🔥

Zutaten:
1 Zucchini
2 Paprika
1 rote Zwiebel
200 g Feta
3 EL Olivenöl

Zubereitung:
Gemüse in Stücke schneiden, mit Öl mischen.
Bei 200 °C 25 Minuten backen, Feta in den letzten 10 Minuten dazu.

#ofengemüse #feierabend
https://www.instagram.com/p/C8xKqRstUvW/`,
    });

    equal('is recognised as Instagram', insta.classified?.source, 'instagram');
    equal('the caption alone is a whole recipe', insta.result?.status, 'ready');
    // The bug this replaces: the draft used to be named after the URL, because
    // the link was still sitting in the text the parser was handed.
    equal('is named after the dish, not the link', insta.result?.draft?.title, 'Ofengemüse mit Feta 🔥');
    check(
        'the title is never the URL',
        !(insta.result?.draft?.title ?? '').includes('instagram.com'),
        insta.result?.draft?.title
    );
    equal('finds every ingredient', insta.result?.draft?.ingredients.length, 5);
    check(
        'remembers the post it came from',
        insta.result?.draft?.sourceUrl === 'https://www.instagram.com/p/C8xKqRstUvW/',
        insta.result?.draft?.sourceUrl
    );
    check(
        'keeps the temperature in the method',
        (insta.result?.draft?.instructions ?? '').includes('200'),
        insta.result?.draft?.instructions
    );
    restore();

    // ── 3. TikTok ───────────────────────────────────────────────────────────
    suite('channel: TikTok');

    restore = stubFetch({});

    const tiktok = await share({
        url: 'https://www.tiktok.com/@koch/video/7311234567890123456',
        text: 'Pasta mit Zitrone\n\n200 g Spaghetti\n1 Zitrone\n50 g Parmesan\n\nNudeln kochen, Zitronenabrieb und Parmesan unterheben.',
    });

    equal('is recognised as TikTok', tiktok.classified?.source, 'tiktok');
    equal('falls back to the shared caption', tiktok.result?.status, 'ready');
    equal('with the dish as its title', tiktok.result?.draft?.title, 'Pasta mit Zitrone');
    equal('and its ingredients', tiktok.result?.draft?.ingredients.length, 3);
    restore();

    // ── 4. An ordinary recipe blog ──────────────────────────────────────────
    suite('channel: a recipe page with schema.org markup');

    restore = stubFetch({ 'https://kochblog.example/zwetschgenkuchen': { html: BLOG } });

    const blog = await share({ url: 'https://kochblog.example/zwetschgenkuchen' });

    equal('is recognised as a web page', blog.classified?.source, 'web');
    equal('comes out ready', blog.result?.status, 'ready');
    equal('takes the name', blog.result?.draft?.title, 'Zwetschgenkuchen vom Blech');
    equal('takes all five ingredients', blog.result?.draft?.ingredients.length, 5);
    equal('reads the yield as a number', blog.result?.draft?.servings, 12);
    equal('reads the prep time', blog.result?.draft?.prepMinutes, 30);
    equal('reads the cooking time', blog.result?.draft?.cookMinutes, 45);
    equal('takes the category', blog.result?.draft?.category, 'Dessert');
    check(
        'keeps all three steps',
        (blog.result?.draft?.instructions ?? '').split('\n').filter((l) => l.trim()).length >= 3,
        blog.result?.draft?.instructions
    );
    restore();

    // ── 5. A note typed into the phone ──────────────────────────────────────
    suite('channel: a note');

    const note = await share({
        text: 'Griessbrei wie bei Oma\n\n500 ml Milch\n80 g Grieß\n2 EL Zucker\n1 Prise Salz\n\nMilch aufkochen, Grieß einrühren, fünf Minuten quellen lassen.',
    });

    equal('is a note, not a link', note.classified?.kind, 'text');
    equal('and is labelled as one', note.classified?.source, 'note');
    equal('a typed recipe is ready', note.result?.status, 'ready');
    equal('with its own title', note.result?.draft?.title, 'Griessbrei wie bei Oma');
    equal('and four ingredients', note.result?.draft?.ingredients.length, 4);

    const thought = await share({ text: 'Mal wieder Ossobuco probieren' });
    equal('a stray thought is not a recipe', thought.result?.status, 'needsWork');
    check('but nothing is thrown away', thought.result?.draft !== null, thought.result?.draft);

    // ── 6. A forwarded e-mail ───────────────────────────────────────────────
    suite('channel: a forwarded e-mail');

    // What the bridge actually posts: the subject after three clients have had
    // a go at it, and getPlainBody(), which keeps the forward separator, the
    // header block, the quote markers and the signature.
    const mail = await share({
        via: 'email',
        subject: 'Fwd: AW: Re: Kartoffelsalat',
        text: `Schau mal, das ist das Rezept von Tante Elfi.

---------- Forwarded message ---------
Von: Elfi <elfi@example.com>
Datum: Di., 12. Aug. 2025 um 18:04 Uhr
Betreff: Kartoffelsalat
An: Moritz <moritz@example.com>

> Kartoffelsalat mit Gurke
>
> Zutaten
> 1 kg festkochende Kartoffeln
> 1 Salatgurke
> 1 Zwiebel
> 200 ml Brühe
> 3 EL Essig
>
> Zubereitung
> Kartoffeln kochen, pellen und in Scheiben schneiden.
> Mit heißer Brühe übergießen und ziehen lassen.
> Gurke und Zwiebel unterheben.

--
Gesendet von meinem iPhone`,
    });

    equal('arrives as an e-mail capture', mail.classified?.source, 'email');
    equal('comes out ready', mail.result?.status, 'ready');
    // Three prefixes, stripped repeatedly rather than once.
    equal('the subject becomes the label, without the prefixes', mail.classified?.note, 'Kartoffelsalat');
    equal('the recipe keeps its own title', mail.result?.draft?.title, 'Kartoffelsalat mit Gurke');
    equal('all five ingredients survive the quote markers', mail.result?.draft?.ingredients.length, 5);
    check(
        'the forwarding headers are gone',
        !(mail.result?.draft?.instructions ?? '').includes('Forwarded message') &&
            !(mail.result?.draft?.instructions ?? '').includes('elfi@example.com'),
        mail.result?.draft?.instructions
    );
    check(
        'the signature is gone',
        !(mail.result?.draft?.instructions ?? '').includes('Gesendet von meinem'),
        mail.result?.draft?.instructions
    );
    check(
        'the quote markers are gone',
        !ingredientNames(mail.result?.draft).some((line) => line.includes('>')),
        ingredientNames(mail.result?.draft)
    );

    // ── 7. An e-mail that is only a link ────────────────────────────────────
    suite('channel: an e-mail carrying a link');

    restore = stubFetch({ 'https://kochblog.example/zwetschgenkuchen': { html: BLOG } });

    const mailedLink = await share({
        via: 'email',
        subject: 'Fwd: das musst du machen',
        text: 'Hier:\n\nhttps://kochblog.example/zwetschgenkuchen\n\nLG\n--\nMoritz',
    });

    // The whole point of following the link rather than filing the mail as a
    // note: the subject is "das musst du machen", which is not a recipe.
    equal('follows the link rather than filing the mail', mailedLink.classified?.kind, 'url');
    equal('and treats it as a web page, not as an e-mail note', mailedLink.classified?.source, 'web');
    equal('so the page is read', mailedLink.result?.status, 'ready');
    equal('and the recipe is named after the dish', mailedLink.result?.draft?.title, 'Zwetschgenkuchen vom Blech');
    check(
        "the subject is still kept as the sender's label",
        mailedLink.classified?.note === 'das musst du machen',
        mailedLink.classified?.note
    );
    restore();

    // ── 8. A photograph ─────────────────────────────────────────────────────
    suite('channel: a photographed page');

    const photo = await processCapture({
        kind: 'image',
        source: 'photo',
        sourceUrl: null,
        rawText: null,
        imageUrl: 'https://blob.example/seite.jpg',
    });

    // Not a failure. There is nothing a rule-based parser can do with a
    // photograph, and saying so is more useful than a confident guess.
    equal('waits for a human rather than failing', photo.status, 'needsWork');
    check('and says what it needs', (photo.error ?? '').length > 0, photo.error);


    // ── 8b. A screenshot ────────────────────────────────────────────────────
    suite('channel: a screenshot');

    const PICTURE = 'https://blob.test/capture_1.png';
    const pixels = Buffer.from('89504e470d0a1a0a' + '00'.repeat(64), 'hex');

    // What the model would answer, in the shape aiImport expects back.
    const aiAnswer = {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    title: 'Ofengemüse mit Feta',
                    description: '',
                    category: '',
                    nationality: '',
                    ingredients: [
                        { amount: '1', item: 'Zucchini' },
                        { amount: '200 g', item: 'Feta' },
                    ],
                    instructions: 'Alles in den Ofen, 25 Minuten bei 200 °C.',
                    servings: 2,
                    prepMinutes: null,
                    cookMinutes: 25,
                }),
            },
        ],
    };

    const previousKey = process.env.ANTHROPIC_API_KEY;

    // Without a key. This is the case that has to keep working, because the
    // whole cookbook is built so that AI is never required.
    delete process.env.ANTHROPIC_API_KEY;
    restore = stubFetch({});

    const noKey = await share({ imageUrl: PICTURE });

    equal('a screenshot on its own is a picture', noKey.classified?.kind, 'image');
    equal('and is labelled a photo', noKey.classified?.source, 'photo');
    equal('with no key it waits for a human rather than failing', noKey.result?.status, 'needsWork');
    equal('and the picture is still there', noKey.result?.draft?.imageUrl, PICTURE);
    check(
        'the message says what it needs rather than what went wrong',
        (noKey.result?.error ?? '').includes('saved'),
        noKey.result?.error
    );
    restore();

    // With a key.
    process.env.ANTHROPIC_API_KEY = 'test-key';
    restore = stubFetch({
        [PICTURE]: { html: '', bytes: pixels, contentType: 'image/png' },
        'https://api.anthropic.com/v1/messages': { html: '', json: aiAnswer },
    });

    const read = await share({ imageUrl: PICTURE });

    equal('with a key the picture is read', read.result?.status, 'ready');
    equal('and gets a real title', read.result?.draft?.title, 'Ofengemüse mit Feta');
    equal('with its ingredients', read.result?.draft?.ingredients.length, 2);
    // A screenshot of a post is also a perfectly good photograph of the dish.
    equal('the screenshot becomes the recipe picture', read.result?.draft?.imageUrl, PICTURE);
    restore();

    // The Instagram case from the other side: the link cannot be read, the
    // caption is not the recipe, but a screenshot came with the share.
    restore = stubFetch({
        [PICTURE]: { html: '', bytes: pixels, contentType: 'image/png' },
        'https://api.anthropic.com/v1/messages': { html: '', json: aiAnswer },
    });

    const rescued = await share({
        url: 'https://www.instagram.com/p/C8xKqRstUvW/',
        text: 'so gut 😍',
        imageUrl: PICTURE,
    });

    equal('a dead link with a screenshot falls back to the picture', rescued.result?.status, 'ready');
    equal('and gets the dish from it', rescued.result?.draft?.title, 'Ofengemüse mit Feta');
    restore();

    // A picture that cannot be fetched back is still not a lost capture.
    restore = stubFetch({ 'https://api.anthropic.com/v1/messages': { html: '', json: aiAnswer } });

    const unreadable = await share({ imageUrl: PICTURE });
    equal('a picture that cannot be read back still waits', unreadable.result?.status, 'needsWork');
    equal('with the link to it kept', unreadable.result?.draft?.imageUrl, PICTURE);
    restore();

    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;

    // ── 9. What the inbox calls each of them ────────────────────────────────
    suite('channel: labels in the inbox');

    // What a row in /admin/inbox is called before anyone opens it. The order
    // is deliberate: an explicit note wins, then the first line of what was
    // shared, then the address — so a bare link still reads as somewhere
    // rather than as nothing.
    equal(
        'a mailed capture is labelled with its subject',
        captureLabel({ sourceUrl: null, rawText: 'Kartoffelsalat mit Gurke\n1 kg Kartoffeln', note: 'Kartoffelsalat' }),
        'Kartoffelsalat'
    );
    equal(
        'a caption is labelled with its first line',
        captureLabel({ sourceUrl: 'https://www.instagram.com/p/C8x/', rawText: 'Ofengemüse mit Feta\n\n1 Zucchini', note: null }),
        'Ofengemüse mit Feta'
    );
    equal(
        'a bare link is labelled with where it points',
        captureLabel({ sourceUrl: 'https://www.kochblog.example/rezepte/kuchen/', rawText: null, note: null }),
        'kochblog.example/rezepte/kuchen'
    );
    equal(
        'a link shared with nothing but itself does not get labelled with its own URL twice',
        captureLabel({ sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', rawText: 'https://youtu.be/dQw4w9WgXcQ', note: null }),
        'youtu.be/dQw4w9WgXcQ'
    );
    // A photograph has no text at all. Empty on purpose: the placeholder
    // wording belongs in the translation catalogue, not in a library.
    equal(
        'a photograph is left for the interface to name',
        captureLabel({ sourceUrl: null, rawText: null, note: null }),
        ''
    );

    // ── 10. The ways a share goes wrong ─────────────────────────────────────
    suite('channel: nothing usable');

    equal('an empty body is refused outright', captureInputFrom({}), null);
    equal('whitespace only is refused', captureInputFrom({ text: '   \n  ' }), null);
    equal('an e-mail with an empty body is refused', captureInputFrom({ via: 'email', subject: 'Re: hi', text: '' }), null);

    restore = stubFetch({});
    const dead = await share({ url: 'https://kochblog.example/weg' });
    equal('a link that cannot be read fails', dead.result?.status, 'failed');
    check('and says so', (dead.result?.error ?? '').length > 0, dead.result?.error);
    restore();

    // ── 11. Hazards that come with real text ────────────────────────────────
    suite('channel: awkward real-world text');

    // Windows line endings: what arrives when someone forwards from Outlook.
    const crlf = await share({
        text: 'Pfannkuchen\r\n\r\n250 ml Milch\r\n2 Eier\r\n125 g Mehl\r\n\r\nAlles verrühren und ausbacken.',
    });
    equal('survives Windows line endings', crlf.result?.status, 'ready');
    equal('with the right title', crlf.result?.draft?.title, 'Pfannkuchen');
    equal('and three ingredients', crlf.result?.draft?.ingredients.length, 3);
    check(
        'no stray carriage returns are left in an ingredient',
        !ingredientNames(crlf.result?.draft).some((line) => line.includes('\r')),
        ingredientNames(crlf.result?.draft)
    );

    // A non-breaking space between number and unit. Copying from almost any
    // recipe site produces these, and they are invisible in every editor.
    const nbsp = await share({
        text: 'Tomatensuppe\n\n500 g Tomaten\n1 EL Öl\n\nAlles pürieren und erhitzen.',
    });
    equal('a non-breaking space does not break the parse', nbsp.result?.status, 'ready');
    equal('and both ingredients are found', nbsp.result?.draft?.ingredients.length, 2);

    // Two captures of the same page must classify identically, or the inbox
    // cannot recognise a duplicate.
    const first = captureInputFrom({ url: 'https://kochblog.example/x' });
    const second = captureInputFrom({ text: 'schau mal https://kochblog.example/x' });
    equal(
        'the same link classifies the same whether it is sent as url or inside text',
        first?.sourceUrl,
        second?.sourceUrl
    );
    equal('and gets the same source', first?.source, second?.source);

    // ── 11. The shape a phone actually posts ────────────────────────────────
    suite('channel: the body an iOS Shortcut sends');

    /*
     * This suite exists because of a bug that reached a phone, and the reason
     * it reached one is worth more than the fix.
     *
     * The route used to store the picture and then classify the body. It was
     * changed to classify first — a good change: a request with nothing usable
     * in it should not pay for a file nobody will ever point at — and the
     * comment written to justify it said "the classifier needs no image to
     * decide".
     *
     * It needs one. Not to decide *which* kind of capture this is, but to
     * decide there is one at all. A share carrying a screenshot and nothing
     * else has no url, no text, and — at that moment, before the upload — no
     * `imageUrl` either. So every screenshot-only capture was answered
     * "Nothing usable was sent." with a 400, which is precisely the rejected
     * share this entire pipeline exists to prevent.
     *
     * Eighty channel checks passed throughout, because all of them handed the
     * pipeline an `imageUrl` — the shape the classifier takes — and not one
     * handed it the `image: {base64, mediaType}` an iOS Shortcut posts. A test
     * written against the shape of the code cannot fail on the shape of the
     * request.
     */

    const SHOT = { base64: 'aGVsbG8=', mediaType: 'image/jpeg' };

    const previousImageKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    restore = stubFetch({});

    const posted = await share({ image: SHOT });

    check('a screenshot on its own is not rejected', posted.classified !== null);
    equal('it is classified as a picture', posted.classified?.kind, 'image');
    equal('labelled a photo', posted.classified?.source, 'photo');
    equal('and it reaches the inbox', posted.result?.status, 'needsWork');
    check(
        'with the stored picture on it, not a null',
        Boolean(posted.result?.draft?.imageUrl),
        posted.result?.draft?.imageUrl
    );

    // Several screenshots combined on the phone arrive as one picture; nothing
    // downstream should be able to tell the difference.
    const combined = await share({ image: { ...SHOT, mediaType: 'image/jpeg' }, note: 'Seite 1-3' });
    equal('a combined screenshot is one capture', combined.classified?.kind, 'image');
    equal('and keeps its note', combined.classified?.note, 'Seite 1-3');

    // The other half of the same change: a caption still beats a picture, and
    // a link still beats both.
    const captioned = await share({ image: SHOT, text: 'Ofengemüse\n\n1 Zucchini\n\nBacken.' });
    equal('a caption with a screenshot is read as text', captioned.classified?.kind, 'text');
    check(
        'and the picture is kept alongside it',
        Boolean(captioned.result?.draft?.imageUrl),
        captioned.result?.draft?.imageUrl
    );

    const linked = await share({ image: SHOT, url: 'https://kochblog.example/x' });
    equal('a link with a screenshot is read as a link', linked.classified?.kind, 'url');

    // And an empty body is still an empty body.
    const nothing = await share({});
    equal('nothing usable is still nothing usable', nothing.classified, null);

    restore();

    if (previousImageKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousImageKey;


    // ── 12. Asking anyway ───────────────────────────────────────────────────
    suite('channel: the button that overrules the scoring');

    /*
     * The scoring decides whether a model is asked without being told to. It
     * reads shape alone: it can see that a draft has a title, ingredients with
     * quantities and a method, and it cannot see that the method belongs to a
     * different recipe. A person reading the draft can.
     *
     * So `force` exists, and what it must do is precise: skip the quality gate
     * entirely, loosen the mode gate from "assists text" to "is switched on at
     * all" — and still refuse when somebody has said never.
     */

    const CLEAN = {
        kind: 'text',
        source: 'note',
        sourceUrl: null,
        rawText: 'Ofengemüse mit Feta\n\n1 Zucchini\n200 g Feta\n2 EL Olivenöl\n\nGemüse schneiden, mit Öl mischen und 25 Minuten backen.',
    };

    const aiAnswerText = {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    title: 'Ofengemüse mit Feta',
                    description: 'Vom Modell gelesen',
                    category: 'Dinner',
                    nationality: 'Greek',
                    ingredients: [{ amount: '1', item: 'Zucchini' }],
                    instructions: '1. Backen.',
                    servings: 2,
                    prepMinutes: null,
                    cookMinutes: 25,
                }),
            },
        ],
    };

    const key = { provider: 'anthropic' as const, apiKey: 'test-key', model: null };

    restore = stubFetch({ 'https://api.anthropic.com/v1/messages': { html: '', json: aiAnswerText } });

    // A clean draft, with the AI fully on: not asked, because it did not need to be.
    const notAsked = await processCapture(CLEAN, { mode: 'always', keys: [key] });
    equal('a clean draft is read by the rules alone', notAsked.readBy, 'rules');
    equal('and no provider is recorded', notAsked.provider, null);

    // The same draft, forced.
    const forced = await processCapture(CLEAN, { mode: 'always', keys: [key] }, { force: true });
    equal('forcing asks anyway', forced.readBy, 'rules+ai');
    equal('and records who answered', forced.provider, 'anthropic');
    equal(
        'the rules still win where they found something',
        forced.draft?.title,
        'Ofengemüse mit Feta'
    );
    check(
        'and the model fills what they did not',
        forced.draft?.description === 'Vom Modell gelesen',
        forced.draft?.description
    );

    // "Pictures only" is a rule about automatic imports. A button is not one.
    const imagesOnly = await processCapture(CLEAN, { mode: 'images', keys: [key] }, { force: true });
    equal('a deliberate press works under "pictures only"', imagesOnly.readBy, 'rules+ai');

    // "Never" means never, button or not.
    const off = await processCapture(CLEAN, { mode: 'off', keys: [key] }, { force: true });
    equal('and never still means never', off.readBy, 'rules');

    // With no key at all, forcing is a no-op rather than a failure.
    const forcedNoKey = await processCapture(CLEAN, { mode: 'always', keys: [] }, { force: true });
    equal('forcing with no key changes nothing', forcedNoKey.readBy, 'rules');
    equal('and the draft survives', forcedNoKey.status, 'ready');

    restore();


    // The question this suite answers: the setting says ask, and the provider
    // is down. What then?
    restore = stubFetch({});   // every request 404s, including the provider

    const THIN = {
        kind: 'text',
        source: 'note',
        sourceUrl: null,
        // Over the eighty-character floor below which nothing is asked at
        // all — that floor is a separate behaviour with its own state, and a
        // test that tripped it would be checking the wrong thing.
        rawText:
            'Irgendein Gericht\n\nZwiebel\nKarotte\nSellerie\nPetersilie\nLauch\nKartoffel\nSalz\nPfeffer\nLorbeerblatt\nMuskatnuss',
    };

    const down = await processCapture(THIN, { mode: 'always', keys: [key] });

    equal('a failed model does not fail the capture', down.status, 'needsWork');
    check('and the draft the rules found is kept', Boolean(down.draft?.title), down.draft?.title);
    equal('but the inbox is told it was asked and got nothing', down.readBy, 'rules+ai-failed');
    equal('with the provider that did not answer', down.provider, 'anthropic');

    // Not asked at all is a different state, and must stay one.
    const quiet = await processCapture(THIN, { mode: 'off', keys: [key] });
    equal('never asking is not the same as asking and failing', quiet.readBy, 'rules');

    restore();


    // ── 13. A shortcut posts whatever the share sheet gave it ───────────────
    suite('channel: the url field is not always a url');

    /*
     * The shortcut on his phone puts Shortcut Input into a field called `url`,
     * because that is the field it was built with. Safari hands it a link.
     * Apple Notes hands it the note — several hundred characters of recipe.
     *
     * What happened then: the prose became `sourceUrl`, the capture was
     * classified as a link, and the pipeline went off to fetch a page whose
     * address was "Käsespätzle 400 g Spätzle…". It failed, and the inbox said
     * the page could not be read — about a complete recipe sitting in the row.
     * "It sort of worked", he said, which is the politest possible description.
     */

    const appleNote = await share({
        url: 'Käsespätzle\n\nZutaten\n400 g Spätzle\n2 Zwiebeln\nSalz\n\nZubereitung\nZwiebeln goldbraun braten und alles schichten.',
    });

    equal('a note posted as a url is read as text', appleNote.classified?.kind, 'text');
    equal('with no source url invented for it', appleNote.classified?.sourceUrl, null);
    equal('and it parses', appleNote.result?.status, 'ready');
    equal('into a real title', appleNote.result?.draft?.title, 'Käsespätzle');
    equal('with its ingredients', appleNote.result?.draft?.ingredients.length, 3);

    // A real link still behaves exactly as before.
    const link = await share({ url: 'https://kochblog.example/rezept' });
    equal('a real url is still a url', link.classified?.kind, 'url');
    equal('and keeps it', link.classified?.sourceUrl, 'https://kochblog.example/rezept');

    // A link with a space in it is not a link; it is text with a link in it,
    // and classifyCapture finds the link itself.
    const both = await share({ url: 'schau mal https://kochblog.example/rezept' });
    equal('text containing a link is classified by the link', both.classified?.kind, 'url');
    equal(
        'the link is extracted rather than used whole',
        both.classified?.sourceUrl,
        'https://kochblog.example/rezept'
    );

    // Both fields filled: neither is dropped.
    const twice = await share({
        url: 'Käsespätzle mit Zwiebeln',
        text: 'Zutaten\n400 g Spätzle\n2 Zwiebeln\n\nZubereitung\nAlles schichten und backen.',
    });
    check(
        'a stray url field is kept alongside the text',
        (twice.classified?.rawText ?? '').includes('Käsespätzle mit Zwiebeln'),
        twice.classified?.rawText
    );
    equal('and the recipe still parses', twice.result?.status, 'ready');

    // An empty url field is not text.
    const blank = await share({ url: '   ', text: 'Tomatensuppe\n\n500 g Tomaten\n1 EL Öl\n\nAlles pürieren und erhitzen.' });
    equal('a blank url field disappears', blank.classified?.kind, 'text');
    equal('and does not become a title', blank.result?.draft?.title, 'Tomatensuppe');

}
