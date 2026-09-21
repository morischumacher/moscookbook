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
}) {
    const classified = captureInputFrom(body);
    if (!classified) return { classified: null, result: null };
    return { classified, result: await processCapture(classified) };
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
}
