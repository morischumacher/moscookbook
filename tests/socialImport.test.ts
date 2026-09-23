/** Instagram and YouTube: links, the embed page, subtitles, reasons */
import { suite, equal, check } from './harness';
import { stubFetch } from './stubFetch';
import { recipeLinksIn } from '../src/lib/recipeLinks';
import { instagramEmbedUrl, instagramShortcode, readInstagramEmbed } from '../src/lib/instagram';
import { bestCaptionTrack, captionText, captionTracksFrom } from '../src/lib/youtubeCaptions';
import { readReason, reason } from '../src/lib/captureReasons';
import { classifyCapture } from '../src/lib/capture';
import { captureInputFrom } from '../src/lib/captureInput';
import { recipeElsewhere } from '../src/lib/socialHints';
import { processCapture } from '../src/lib/captureProcess';

const BLOG = `<!DOCTYPE html><html><head><title>Hainanese Chicken Rice | Kochblog</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Hainanese Chicken Rice","image":"https://kochblog.example/huhn.jpg","recipeIngredient":["1 Huhn","300 g Jasminreis","1 Stück Ingwer","4 Knoblauchzehen"],"recipeInstructions":[{"@type":"HowToStep","text":"Das Huhn mit Ingwer 40 Minuten sanft garen."},{"@type":"HowToStep","text":"Den Reis in der Brühe mit Knoblauch kochen und servieren."}]}</script>
</head><body><h1>Hainanese Chicken Rice</h1></body></html>`;

const LINKING_VIDEO = `<!DOCTYPE html><html><head>
<meta property="og:image" content="https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg">
</head><body><script>var r = {"videoDetails":{"videoId":"abcdefghijk","title":"I made the BEST chicken rice","shortDescription":"So gut!\\n\\nMein Instagram: https://instagram.com/koch\\nDas ganze Rezept:\\nhttps://kochblog.example/chicken-rice\\n\\nMesser: https://amzn.to/xyz","isOwnerViewing":false}};</script></body></html>`;

const SPOKEN_VIDEO = `<!DOCTYPE html><html><body><script>var r = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abcdefghijk\\u0026lang=de\\u0026kind=asr","name":{"simpleText":"Deutsch (automatisch erzeugt)"},"vssId":"a.de","languageCode":"de","kind":"asr"}]}},"videoDetails":{"videoId":"abcdefghijk","title":"Curry in 10 Minuten","shortDescription":"Viel Spa\\u00df!","isOwnerViewing":false}};</script></body></html>`;

const EMBED = `<html><body><div class="Embed"><img class="EmbeddedMediaImage" alt="Pasta" src="https://scontent.cdninstagram.com/pasta.jpg?a=1&amp;b=2"><div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/nonna/" target="_blank">nonna</a><br /><br />Spaghetti Aglio e Olio<br /><br />Zutaten<br />400 g Spaghetti<br />4 Knoblauchzehen<br />1 Chili<br /><br />Zubereitung<br />Knoblauch in &Ouml;l anbraten und mit den Nudeln mischen.<div class="CaptionComments"></div></div></div></body></html>`;

export default async function socialImportTests() {
    suite('social: links in a description');
    equal(
        'the recipe link, not the channels or the shop',
        recipeLinksIn('Folgt mir: https://instagram.com/koch\nKnife: https://amzn.to/abc\nRezept: https://blog.example/curry.'),
        ['https://blog.example/curry']
    );
    equal(
        'a link under "Rezept" beats one above it',
        recipeLinksIn('Mein Shop https://shop.example\nDas ganze Rezept:\nhttps://blog.example/r'),
        ['https://blog.example/r', 'https://shop.example']
    );
    equal('at most two', recipeLinksIn('https://a.example https://b.example https://c.example').length, 2);
    equal('none at all', recipeLinksIn('Viel Spaß beim Nachkochen!'), []);

    suite('social: Instagram without an account');
    equal('a post', instagramShortcode('https://www.instagram.com/p/C8Qp0XbN0bX/?igsh=abc'), 'C8Qp0XbN0bX');
    equal('a reel', instagramShortcode('https://instagram.com/reel/DAbc123xyz/'), 'DAbc123xyz');
    equal('a reel under a profile', instagramShortcode('https://www.instagram.com/nonna/reel/DAbc123xyz/'), 'DAbc123xyz');
    equal('a profile is not a post', instagramShortcode('https://www.instagram.com/nonna/'), null);
    equal('the embed address', instagramEmbedUrl('DAbc123xyz'), 'https://www.instagram.com/p/DAbc123xyz/embed/captioned/');

    const read = readInstagramEmbed(EMBED);
    check('the caption, line by line', read.caption.startsWith('Spaghetti Aglio e Olio\n\nZutaten\n400 g Spaghetti'), read.caption);
    check('entities decoded', read.caption.includes('in Öl anbraten'), read.caption);
    equal('without the username', read.author, 'nonna');
    equal('and the picture', read.imageUrl, 'https://scontent.cdninstagram.com/pasta.jpg?a=1&b=2');

    const fromJson = readInstagramEmbed(`<script>{"shortcode_media":{"edge_media_to_caption":{"edges":[{"node":{"text":"Linsensuppe\\n\\nZutaten\\n200 g Linsen"}}]}}}</script>`);
    equal('the JSON shape too', fromJson.caption, 'Linsensuppe\n\nZutaten\n200 g Linsen');

    suite('social: YouTube subtitles');
    const tracks = captionTracksFrom(SPOKEN_VIDEO);
    equal('the track is found', tracks.length, 1);
    equal('with its address unescaped', tracks[0].baseUrl, 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=de&kind=asr');
    equal(
        'written captions beat generated ones',
        bestCaptionTrack([
            { baseUrl: 'a', languageCode: 'de', kind: 'asr' },
            { baseUrl: 'b', languageCode: 'en' },
        ])?.baseUrl,
        'b'
    );
    equal(
        'the classic XML',
        captionText('<transcript><text start="0" dur="2">Wir nehmen 200 g Reis</text><text start="2" dur="1">[Musik]</text><text start="3" dur="2">und Kokosmilch &amp;#39;n Schuss</text></transcript>'),
        "Wir nehmen 200 g Reis und Kokosmilch 'n Schuss"
    );
    equal('the newer XML', captionText('<timedtext><body><p t="0" d="1"><s>zwei</s><s> Zwiebeln</s></p></body></timedtext>'), 'zwei Zwiebeln');

    suite('social: reasons the inbox translates');
    equal('a code and its detail', readReason(reason('pageUnreadable', 'timeout')), { code: 'pageUnreadable', detail: 'timeout' });
    equal('an old sentence is left alone', readReason('The page held only part of a recipe.'), null);
    equal('an unknown code is left alone', readReason('reason:whatever'), null);

    suite('social: a link in the description is followed');
    let restore = stubFetch({
        'https://www.youtube.com/watch?v=abcdefghijk': { html: LINKING_VIDEO },
        'https://kochblog.example/chicken-rice': { html: BLOG },
    });
    const linked = await processCapture(classifyCapture({ url: 'https://www.youtube.com/watch?v=abcdefghijk' })!, { mode: 'off', keys: [] });
    equal('the blog makes it ready', linked.status, 'ready');
    equal('with the blog\'s name for it', linked.draft?.title, 'Hainanese Chicken Rice');
    equal('all its ingredients', linked.draft?.ingredients.length, 4);
    equal('filed under the video that was shared', linked.draft?.sourceUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
    restore();

    suite('social: a recipe only spoken');
    restore = stubFetch({ 'https://www.youtube.com/watch?v=abcdefghijk': { html: SPOKEN_VIDEO } });
    const spoken = await processCapture(classifyCapture({ url: 'https://www.youtube.com/watch?v=abcdefghijk' })!, { mode: 'off', keys: [] });
    equal('needs a minute', spoken.status, 'needsWork');
    equal('and says subtitles are there for a model to read', readReason(spoken.error)?.code, 'videoSpokenNeedsAi');
    restore();

    restore = stubFetch({
        'https://www.youtube.com/watch?v=abcdefghijk': { html: LINKING_VIDEO.replace(/https:\/\/kochblog[^\\]*/, '') },
    });
    const quiet = await processCapture(classifyCapture({ url: 'https://www.youtube.com/watch?v=abcdefghijk' })!, { mode: 'off', keys: [] });
    equal('no subtitles and no recipe: the recipe is in the video', readReason(quiet.error)?.code, 'videoSpoken');
    restore();

    suite('social: Instagram through its embed page');
    restore = stubFetch({ 'https://www.instagram.com/p/DAbc123xyz/embed/captioned/': { html: EMBED } });
    const post = await processCapture(classifyCapture({ url: 'https://www.instagram.com/reel/DAbc123xyz/?igsh=x' })!, { mode: 'off', keys: [] });
    equal('the whole caption, without a login', post.status, 'ready');
    equal('named after its first line', post.draft?.title, 'Spaghetti Aglio e Olio');
    equal('with the post\'s picture', post.draft?.imageUrl, 'https://scontent.cdninstagram.com/pasta.jpg?a=1&b=2');
    restore();

    restore = stubFetch({
        'https://www.instagram.com/p/DAbc123xyz/embed/captioned/': {
            html: '<div class="Caption"><a class="CaptionUsername" href="#">koch</a> Leftover bacon? Recipe on my blog: https://kochblog.example/chicken-rice<div class="CaptionComments"></div></div>',
        },
        'https://kochblog.example/chicken-rice': { html: BLOG },
    });
    const teaser = await processCapture(classifyCapture({ url: 'https://www.instagram.com/p/DAbc123xyz/' })!, { mode: 'off', keys: [] });
    equal('a caption that points at the recipe is followed', teaser.status, 'ready');
    equal('to the recipe', teaser.draft?.title, 'Hainanese Chicken Rice');
    restore();

    suite('social: a screenshot with a link');
    const both = captureInputFrom({ url: 'https://www.instagram.com/p/DAbc123xyz/', image: { base64: 'AAAA', mediaType: 'image/jpeg' } });
    equal('is read as the link, with the picture as the fallback', both?.kind, 'url');
    const junk = captureInputFrom({ url: 'Einkaufsliste Milch Eier', image: { base64: 'AAAA', mediaType: 'image/jpeg' } });
    equal('whatever else was on the clipboard is ignored', junk?.kind, 'image');
    equal('and not read as a recipe', junk?.rawText, null);

    suite('social: the recipe is somewhere else');
    equal('link in bio', recipeElsewhere('So lecker! Rezept findet ihr über den Link in meiner Bio 🍝'), 'bio');
    equal('link in bio, English', recipeElsewhere('Full recipe at the link in bio!'), 'bio');
    equal('in the comments', recipeElsewhere('Das Rezept steht im ersten Kommentar 👇'), 'comments');
    equal('recipe in comments, English', recipeElsewhere('Recipe in the comments below'), 'comments');
    equal('comment for a DM', recipeElsewhere('Kommentiere PASTA und ich schicke dir das Rezept per Nachricht!'), 'dm');
    equal('comment for a DM, English', recipeElsewhere('Comment "SOUP" and I\'ll send you the recipe'), 'dm');
    equal('nothing of the kind', recipeElsewhere('Zutaten: 200 g Mehl, 2 Eier'), null);

    restore = stubFetch({
        'https://www.instagram.com/p/DAbc123xyz/embed/captioned/': {
            html: '<div class="Caption"><a class="CaptionUsername" href="#">koch</a> Die beste Pasta! Rezept über den Link in meiner Bio.<div class="CaptionComments"></div></div>',
        },
    });
    const bio = await processCapture(classifyCapture({ url: 'https://www.instagram.com/p/DAbc123xyz/' })!, { mode: 'off', keys: [] });
    equal('the inbox says where the recipe is', readReason(bio.error)?.code, 'recipeInBio');
    restore();
}
