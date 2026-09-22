import { suite, check, equal } from './harness';
import { readableText, MAX_READABLE } from '../src/lib/readableText';

/**
 * A page reduced to its words.
 *
 * The failure mode worth guarding against is not a wrong answer but a
 * *plausible* one: a stripper that leaves the script tags in sends forty
 * kilobytes of JavaScript to a model, which reads it, finds no recipe, and
 * reports that the page did not contain one. Nothing errors and the bill is
 * thirty times higher than it should be.
 */
export default function readableTextTests() {
    suite('readableText');

    const page = `<!DOCTYPE html>
<html><head>
<title>Kochblog</title>
<style>.ad { display: none }</style>
<script>window.dataLayer = [{"recipe": "not this one"}];</script>
</head>
<body>
<nav><a href="/">Start</a><a href="/blog">Blog</a></nav>
<h1>Ofengem&uuml;se mit Feta</h1>
<p>Ein Rezept f&#252;r zwei.</p>
<ul>
  <li>1 Zucchini</li>
  <li>200&nbsp;g Feta</li>
</ul>
<p>Alles in den Ofen, 25 Minuten bei 200&#xB0;C.</p>
<script>console.log('tracking');</script>
<noscript>Bitte JavaScript einschalten</noscript>
<footer>Impressum &amp; Datenschutz</footer>
</body></html>`;

    const text = readableText(page);

    check('the heading survives', text.includes('Ofengemüse mit Feta'), text);
    check('the entity is decoded', text.includes('für zwei'), text);
    check('the numeric entity too', text.includes('200°C'), text);
    check('a non-breaking space becomes a space', text.includes('200 g Feta'), text);

    check('script contents are gone', !text.includes('dataLayer'), text);
    check('and so is the second script', !text.includes('tracking'), text);
    check('style rules are gone', !text.includes('display: none'), text);
    check('noscript is gone', !text.includes('JavaScript einschalten'), text);
    check('the navigation is gone', !text.includes('Start'), text);
    check('the footer is gone', !text.includes('Impressum'), text);

    check('no tags are left', !text.includes('<'), text);

    // The structure is the recipe. An ingredient list flattened into one line
    // is a sentence, and a parser — human or otherwise — reads it as one.
    const lines = text.split('\n');
    check(
        'each ingredient is its own line',
        lines.includes('1 Zucchini') && lines.includes('200 g Feta'),
        lines
    );

    /* ------------------------------------------------------- picking a part */

    suite('readableText: where the article is');

    const filler = '<p>Hier steht ein langer Einleitungstext. </p>'.repeat(30);
    const withArticle = `<html><body>
<div>Cookie-Hinweis: wir verwenden Cookies.</div>
<article>${filler}<h2>Zutaten</h2><ul><li>1 Zwiebel</li></ul></article>
<aside>Mehr Rezepte</aside>
</body></html>`;

    const narrowed = readableText(withArticle);
    check('the article is used', narrowed.includes('1 Zwiebel'), narrowed);
    check('and what is outside it is not', !narrowed.includes('Cookie-Hinweis'), narrowed);

    // A tiny <article> is a layout element, not the article — falling through
    // to the body is better than returning a heading on its own.
    const tinyArticle = '<html><body><article><h2>Neu</h2></article><p>Das eigentliche Rezept: 1 Zwiebel, 2 Karotten, alles anbraten und mit Brühe aufgießen.</p></body></html>';
    check(
        'a tiny article is ignored',
        readableText(tinyArticle).includes('2 Karotten'),
        readableText(tinyArticle)
    );

    /*
     * The bug this file exists to prevent from coming back.
     *
     * Squarespace gives a recipe page one `<article>` per component, so the
     * ingredients and the method are siblings. The first version of `narrow`
     * matched non-greedily and took the first hit, which paired the *first*
     * opening tag with the *first* closing tag — everything from the second
     * `</article>` onwards was dropped.
     *
     * On a real page that meant forty-seven ingredients and no method at all,
     * and the model was blamed for returning a recipe without one. It never saw
     * one. The two checks below are the two halves of that page.
     */
    const siblings = `<html><body>
<header>Joshua Weissman</header>
<article><h2>Ingredients</h2><ul><li>4 chicken thighs</li><li>2 cups buttermilk</li><li>1 tbsp salt</li></ul>${'<p>Plus a note about the brine. </p>'.repeat(20)}</article>
<article><h2>Method</h2><ol><li>Brine the chicken overnight.</li><li>Dredge in seasoned flour.</li><li>Fry at 175°C until golden.</li></ol>${'<p>Plus a note about the oil. </p>'.repeat(20)}</article>
</body></html>`;

    const both = readableText(siblings);
    check('sibling articles: the ingredients survive', both.includes('2 cups buttermilk'), both);
    check('sibling articles: so does the method', both.includes('Dredge in seasoned flour'), both);

    // Nested containers are the same bug wearing a different hat: `<main>`
    // around `<article>` around the recipe.
    const nested = `<html><body><main><article><h2>Zutaten</h2><ul><li>500 g Tomaten</li></ul></article>${'<p>Ein Absatz Vorrede. </p>'.repeat(25)}<article><h2>Zubereitung</h2><p>Alles pürieren und erhitzen.</p></article></main></body></html>`;

    const deep = readableText(nested);
    check('nested containers: the ingredients survive', deep.includes('500 g Tomaten'), deep);
    check('nested containers: so does the method', deep.includes('Alles pürieren'), deep);

    /*
     * And the guard that makes the heuristic checkable rather than trusted: a
     * container that accounts for almost none of the page is disbelieved, and
     * the whole page is sent instead. Too much page is a bill; half a recipe is
     * a wrong recipe.
     */
    const misleading = `<html><body>
<article>${'<p>Ein Teaser für ein anderes Rezept. </p>'.repeat(20)}</article>
<div><h1>Linsensuppe</h1><ul><li>250 g Linsen</li><li>1 Karotte</li></ul>${'<p>Die Linsen über Nacht einweichen und am nächsten Tag weich kochen. </p>'.repeat(40)}</div>
</body></html>`;

    const fellBack = readableText(misleading);
    check(
        'a container holding almost nothing is disbelieved',
        fellBack.includes('250 g Linsen'),
        fellBack.slice(0, 300)
    );

    /* ------------------------------------------------------------ the ceiling */

    suite('readableText: the ceiling');

    const huge = `<html><body>${'<p>Lorem ipsum dolor sit amet. </p>'.repeat(5000)}</body></html>`;
    const capped = readableText(huge);
    check('a very long page is capped', capped.length <= MAX_READABLE, capped.length);

    /* -------------------------------------------------------------- nonsense */

    suite('readableText: malformed input');

    equal('an empty page gives an empty string', readableText(''), '');
    equal('a page with only markup gives nothing', readableText('<div><span></span></div>'), '');

    // A comment containing a `>` would end early if comments were stripped by
    // the same rule as tags.
    check(
        'a comment with a bracket in it is removed whole',
        !readableText('<p>a</p><!-- 3 > 2 hidden -->').includes('hidden'),
        readableText('<p>a</p><!-- 3 > 2 hidden -->')
    );

    // An unclosed script would otherwise leave its contents in the output.
    check(
        'an unclosed tag does not leak the rest of the page',
        !readableText('<p>Rezept</p><script>var x = 1;').includes('var x'),
        readableText('<p>Rezept</p><script>var x = 1;')
    );
}
