/** htmlMeta — the one way a page's entities, meta tags and JSON-LD are read */
import { suite, check, equal } from './harness';
import {
    decodeEntities,
    plainText,
    metaTag,
    metaContent,
    metaLines,
    metaTagsPresent,
    jsonLdDocuments,
    jsonLdBlockCount,
} from '../src/lib/htmlMeta';
import { extractRecipeFromHtml } from '../src/lib/recipeFromHtml';

export default function htmlMetaTests() {
    suite('decodeEntities');

    equal('a German word', decodeEntities('Ofengem&uuml;se'), 'Ofengemüse');
    equal('case matters', decodeEntities('&Uuml;bung &uuml;ben'), 'Übung üben');
    equal('numeric decimal', decodeEntities('200&#176;C'), '200°C');
    equal('numeric hex', decodeEntities('200&#xB0;C'), '200°C');
    equal('nbsp becomes a space', decodeEntities('200&nbsp;g'), '200 g');
    equal('an unknown name is left alone', decodeEntities('&hellip;x&bogus;'), '…x&bogus;');
    // A single pass cannot double-decode: `&amp;uuml;` is the literal text
    // "&uuml;", not the letter.
    equal('no double decoding', decodeEntities('&amp;uuml;'), '&uuml;');

    /*
     * The bug that made this file. The seventeen-name copy in recipeFromHtml
     * called String.fromCodePoint on whatever number the page said, and
     * 0x110000 is where Unicode ends — past it the call throws RangeError.
     * That decoder sat inside extractRecipeFromHtml with nothing around it,
     * so a page saying &#1114112; took the import down.
     */
    equal('a code point past the end of Unicode is dropped, not thrown', decodeEntities('a&#1114112;b'), 'ab');
    equal('zero is dropped', decodeEntities('a&#0;b'), 'ab');
    equal('a seven-digit number past the end is dropped', decodeEntities('a&#9999999;b'), 'ab');

    let survived = true;
    try {
        extractRecipeFromHtml(
            '<script type="application/ld+json">{"@type":"Recipe","name":"Suppe &#1114112;","recipeIngredient":["1 l Br&#1114112;he"],"recipeInstructions":"Kochen."}</script>'
        );
    } catch {
        survived = false;
    }
    check('and the recipe extractor survives one', survived);

    suite('plainText');

    equal('tags gone, entities decoded, spaces squeezed', plainText('<p>Cremig  &amp;\n schnell</p>'), 'Cremig & schnell');
    equal('a non-string is nothing', plainText(42), '');

    suite('metaTag');

    const head = `<head>
<meta property="og:title" content="Linsensuppe &ndash; Kochblog">
<meta name="description" content="Zeile 1&#10;Zeile 2">
<meta property="og:image" content="https://x.example/a.jpg">
</head>`;

    equal('a property tag', metaTag(head, 'og:title'), 'Linsensuppe &ndash; Kochblog');
    equal('a name tag', metaTag(head, 'description'), 'Zeile 1&#10;Zeile 2');
    equal('a missing tag is null', metaTag(head, 'og:description'), null);
    // A property name is put into a regex; the dot in "og.title" must not
    // become a wildcard that matches "og:title".
    equal('the property is matched literally', metaTag(head, 'og.title'), null);

    equal('metaContent flattens', metaContent(head, 'description'), 'Zeile 1 Zeile 2');
    equal('metaLines keeps the break', metaLines(head, 'description'), 'Zeile 1\nZeile 2');
    equal('metaContent decodes', metaContent(head, 'og:title'), 'Linsensuppe – Kochblog');

    equal(
        'which tags are there',
        metaTagsPresent(head, ['og:title', 'og:description', 'og:image', 'description']),
        ['og:title', 'og:image', 'description']
    );

    suite('jsonLdDocuments');

    const page = `<html><head>
<script type="application/ld+json">{"@type":"Recipe","name":"A"}</script>
<script type="application/ld+json"><![CDATA[{"@type":"WebSite"}]]></script>
<script type="application/ld+json">{ not json</script>
<script type="text/javascript">{"@type":"NotThis"}</script>
</head></html>`;

    equal('counts every block, parseable or not', jsonLdBlockCount(page), 3);
    const docs = jsonLdDocuments(page);
    equal('parses the ones that parse', docs.length, 2);
    check('strips a CDATA wrapper', docs.some((d) => (d as { '@type': string })['@type'] === 'WebSite'), docs);
    check('ignores scripts of other types', !docs.some((d) => (d as { '@type': string })['@type'] === 'NotThis'), docs);
}
