import { suite, equal, check } from './harness';
import {
    youtubeVideoId,
    extractYoutubePage,
    cleanYoutubeDescription,
} from '../src/lib/youtube';

/**
 * A watch page is megabytes of minified JavaScript; what matters here is the
 * shape around the two values that are read out of it.
 *
 * Honest limitation: this fixture is built to match the structure YouTube
 * serves, not captured from a live request — the sandbox this was written in
 * cannot reach youtube.com. It pins the parsing, not YouTube's page format.
 * If YouTube moves `shortDescription`, these tests keep passing and the import
 * stops working, which is why the capture keeps its raw payload and can be
 * re-processed rather than being lost.
 */
const FIXTURE = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Käsespätzle - das beste Rezept">
<meta property="og:description" content="Zutaten: 400 g Spätzle...">
<meta property="og:image" content="https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg">
</head><body>
<script>var x = {"title":"Startseite","items":[{"title":"Ein ganz anderes Video"}]};</script>
<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abcdefghijk","title":"K\\u00e4sesp\\u00e4tzle - das beste Rezept","lengthSeconds":"482","channelId":"UC123","shortDescription":"Zutaten f\\u00fcr 4 Portionen:\\n400 g Sp\\u00e4tzle\\n200 g Bergk\\u00e4se\\n2 Zwiebeln\\n\\nZubereitung:\\nZwiebeln gold\\u00e4braun r\\u00f6sten.\\nAlles schichten.\\n\\n0:00 Intro\\n1:20 Die Zwiebeln\\nAbonniert den Kanal!\\nhttps://instagram.com/koch\\nMein Messer: https://shop.example.com/messer","isOwnerViewing":false},"microformat":{"playerMicroformatRenderer":{"ownerChannelName":"Kochkanal"}}};</script>
</body></html>`;

export default function youtubeTests() {
    suite('youtubeVideoId');

    equal(
        'reads a watch link',
        youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        'dQw4w9WgXcQ'
    );
    equal('reads a short link', youtubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    equal(
        'reads a Shorts link, which is how most phone shares arrive',
        youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
        'dQw4w9WgXcQ'
    );
    equal('reads an embed link', youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    equal('reads the mobile host', youtubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    equal(
        'keeps working when the share carries tracking parameters',
        youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=xYz123&t=42'),
        'dQw4w9WgXcQ'
    );
    equal('rejects another site', youtubeVideoId('https://vimeo.com/12345'), null);
    equal('rejects a YouTube page that is not a video', youtubeVideoId('https://www.youtube.com/feed/subscriptions'), null);
    equal('rejects nonsense', youtubeVideoId('not a url'), null);
    equal(
        'rejects a lookalike host',
        youtubeVideoId('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'),
        null
    );

    suite('extractYoutubePage');

    const page = extractYoutubePage(FIXTURE, 'abcdefghijk');

    equal(
        'reads the video title, not the first "title" on the page',
        page.title,
        'Käsespätzle - das beste Rezept'
    );
    check(
        'decodes escaped umlauts in the description',
        page.description.includes('Bergkäse') && page.description.includes('Spätzle'),
        page.description
    );
    check(
        'reads the full description, not the truncated meta tag',
        page.description.includes('Zubereitung'),
        page.description
    );
    equal('reads the channel', page.channel, 'Kochkanal');
    equal(
        'reads the thumbnail',
        page.imageUrl,
        'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg'
    );

    const bare = extractYoutubePage(
        '<html><head><meta property="og:title" content="Nur ein Titel"></head></html>',
        'abcdefghijk'
    );
    equal('falls back to og:title when the player JSON is absent', bare.title, 'Nur ein Titel');
    equal(
        'falls back to a thumbnail built from the id',
        bare.imageUrl,
        'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg'
    );
    equal('returns an empty description rather than throwing', bare.description, '');

    suite('cleanYoutubeDescription');

    const cleaned = cleanYoutubeDescription(page.description);

    check('keeps the ingredients', cleaned.includes('400 g Spätzle'), cleaned);
    check('keeps the method', cleaned.includes('Alles schichten.'), cleaned);
    check('drops chapter timestamps', !cleaned.includes('0:00 Intro'), cleaned);
    check('drops the subscribe plea', !/Abonniert/.test(cleaned), cleaned);
    check('drops a line that is only a link', !cleaned.includes('instagram.com/koch'), cleaned);

    // Conservative on purpose: a line with a link *and* content stays, because
    // losing an ingredient is worse than keeping a stray URL.
    check(
        'keeps a line that has a link but also says something',
        cleanYoutubeDescription('200 g Käse https://shop.example.com/kaese').includes('200 g Käse'),
        cleanYoutubeDescription('200 g Käse https://shop.example.com/kaese')
    );

    equal('survives an empty description', cleanYoutubeDescription(''), '');
}
