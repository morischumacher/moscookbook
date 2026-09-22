/** siteProfile — reading a page the way a learned profile says to */
import { suite, check, equal } from './harness';
import {
    applyProfile,
    isUsefulProfile,
    profileSchema,
    type SiteProfile,
} from '../src/lib/siteProfile';

/**
 * The failure this file is written against is not "the profile found nothing".
 * That one is loud: the draft is empty, the scoring calls it poor, and the
 * import falls back to a model. It is self-correcting.
 *
 * The dangerous one is a profile that finds *something else* — the related-
 * recipes rail read as ingredients — because that produces a well-formed,
 * plausible, wrong recipe, which is the one outcome nothing downstream can
 * detect. So most of what follows is about a strategy matching the thing it
 * was pointed at and nothing near it.
 */
export default function siteProfileTests() {
    suite('siteProfile: headings as anchors');

    const page = `<html><head>
<meta property="og:title" content="Fried Chicken Sandwich — Joshua Weissman">
<meta property="og:image" content="https://example.com/chicken.jpg">
</head><body>
<h1>Fried Chicken Sandwich</h1>
<p>Der beste, den ich kenne.</p>
<h2>Ingredients</h2>
<ul><li>4 chicken thighs</li><li>2 cups buttermilk</li><li>1 tbsp salt</li></ul>
<h2>Method</h2>
<p>Brine the chicken overnight.</p>
<h3>For the dredge</h3>
<p>Mix the flour with the spices.</p>
<p>Fry at 175°C until golden.</p>
<h2>You might also like</h2>
<ul><li>Spicy noodles</li><li>Miso soup</li></ul>
</body></html>`;

    const profile: SiteProfile = {
        title: { kind: 'meta', property: 'og:title' },
        image: { kind: 'meta', property: 'og:image' },
        ingredients: { kind: 'listAfterHeading', heading: 'Ingredients' },
        method: { kind: 'textAfterHeading', heading: 'Method' },
    };

    const read = applyProfile(page, profile);

    check('the meta title is used', read.title.startsWith('Fried Chicken Sandwich'), read.title);
    check('the image comes through', read.imageUrl === 'https://example.com/chicken.jpg', read.imageUrl);
    check('all three ingredients', read.ingredients.length === 3, read.ingredients);
    check('and the right ones', read.ingredients.includes('2 cups buttermilk'), read.ingredients);
    check('nothing is reported missing', read.missing.length === 0, read.missing);

    /*
     * The list under the *other* heading is the whole danger. Three ingredients
     * plus two recipe names is a draft that scores perfectly well and is wrong.
     */
    check(
        'the related-recipes list is not picked up',
        !read.ingredients.some((line) => line.includes('Miso')),
        read.ingredients
    );

    /*
     * A method broken into sub-steps is the normal case, and stopping at the
     * next heading of any rank would return only its first paragraph.
     */
    check('the method crosses its subheading', read.method.includes('Fry at 175'), read.method);
    check('and keeps the subheading text', read.method.includes('For the dredge'), read.method);
    check('but stops at the next heading of its rank', !read.method.includes('Spicy noodles'), read.method);

    /* ------------------------------------------------------- heading matching */

    suite('siteProfile: how a heading is matched');

    const punctuated = page.replace('<h2>Ingredients</h2>', '<h2>INGREDIENTS:</h2>');
    check(
        'case and a trailing colon do not matter',
        applyProfile(punctuated, profile).ingredients.length === 3,
        applyProfile(punctuated, profile).ingredients
    );

    const extended = page.replace('<h2>Ingredients</h2>', '<h2>Ingredients (for 4 people)</h2>');
    check(
        'an editor adding words to the heading does not break it',
        applyProfile(extended, profile).ingredients.length === 3,
        applyProfile(extended, profile).ingredients
    );

    // Exact beats prefix, so a page carrying both headings is not read off the
    // wrong one.
    const both = `<html><body>
<h2>Ingredients for the sauce</h2><ul><li>2 EL Sojasauce</li></ul>
<h2>Ingredients</h2><ul><li>4 chicken thighs</li><li>2 cups buttermilk</li></ul>
</body></html>`;
    const exact = applyProfile(both, { ingredients: { kind: 'listAfterHeading', heading: 'Ingredients' } });
    check('an exact heading wins over one that merely starts the same', exact.ingredients.length === 2, exact.ingredients);

    /* ------------------------------------------------------------- going stale */

    suite('siteProfile: a site that changed');

    const redesigned = page.replace('<h2>Ingredients</h2>', '<h2>Was du brauchst</h2>');
    const stale = applyProfile(redesigned, profile);

    check('a missing anchor finds nothing', stale.ingredients.length === 0, stale.ingredients);
    check('and says which field it was', stale.missing.includes('ingredients'), stale.missing);
    check('without inventing a substitute', stale.ingredients.length === 0, stale.ingredients);
    // The rest of the profile still works, so the fallback has something to
    // build on rather than starting from nothing.
    check('the fields that still work still work', stale.method.includes('Brine the chicken'), stale.method);

    /* ------------------------------------------------------------ the fallback */

    suite('siteProfile: selectors');

    const noHeadings = `<html><body>
<div class="recipe"><ul class="ing"><li>500 g Mehl</li><li>3 Eier</li></ul>
<div class="steps">Alles verkneten und ruhen lassen.</div></div>
<ul class="promo"><li>Newsletter</li></ul>
</body></html>`;

    const bySelector = applyProfile(noHeadings, {
        ingredients: { kind: 'selector', selector: '.ing li', take: 'each' },
        method: { kind: 'selector', selector: '.steps', take: 'text' },
    });

    check('a selector reads a list', bySelector.ingredients.length === 2, bySelector.ingredients);
    check('and the right list', !bySelector.ingredients.includes('Newsletter'), bySelector.ingredients);
    check('a selector reads one block of text', bySelector.method.includes('verkneten'), bySelector.method);

    // An invalid selector throws in the parser rather than matching nothing.
    const broken = applyProfile(noHeadings, {
        ingredients: { kind: 'selector', selector: ':::not a selector', take: 'each' },
    });
    check('a selector that will not parse is a miss, not a crash', broken.missing.includes('ingredients'), broken);

    // node-html-parser counts script text as text, so a selector over a raw
    // page could otherwise return a stylesheet.
    const scripted = '<html><body><style>.x{color:red}</style><div class="steps"><script>var a=1</script>Anbraten.</div></body></html>';
    const cleaned = applyProfile(scripted, { method: { kind: 'selector', selector: '.steps', take: 'text' } });
    check('scripts do not leak through a selector', !cleaned.method.includes('var a'), cleaned.method);
    check('but the text does', cleaned.method.includes('Anbraten'), cleaned.method);

    /* --------------------------------------------------------------- JSON-LD */

    suite('siteProfile: a named JSON-LD path');

    const almost = `<html><body><script type="application/ld+json">
{"@type":"Article","recipeBits":{"items":["250 g Linsen","1 Karotte"],"how":"Weich kochen."}}
</script></body></html>`;

    const named = applyProfile(almost, {
        ingredients: { kind: 'jsonLd', path: 'recipeBits.items' },
        method: { kind: 'jsonLd', path: 'recipeBits.how' },
    });
    check('a path into non-Recipe structured data works', named.ingredients.length === 2, named.ingredients);
    check('and a string field too', named.method === 'Weich kochen.', named.method);

    const indexed = applyProfile(
        '<html><body><script type="application/ld+json">[{"@type":"X"},{"@type":"Y","name":"Linsensuppe"}]</script></body></html>',
        { title: { kind: 'jsonLd', path: '1.name' } }
    );
    equal('an array index in a path', indexed.title, 'Linsensuppe');

    /*
     * These pin *behaviour*, not the deny-list. With the list removed they
     * still pass, because the `typeof !== 'object'` step-check already ends
     * the walk at `constructor` (a function). That is worth knowing: the
     * sabotage run found it, and the first version of this comment claimed a
     * hole that was not there. The list stays as a statement of intent; these
     * checks stay as the guarantee that nothing in the prototype chain ever
     * reaches a field, by whichever mechanism.
     */
    for (const forbidden of ['__proto__.x', 'constructor.name', 'a.prototype.b', 'constructor']) {
        const probed = applyProfile(
            '<html><body><script type="application/ld+json">{"a":{"b":"x"}}</script></body></html>',
            { title: { kind: 'jsonLd', path: forbidden } }
        );
        check(`a path through ${forbidden} finds nothing`, probed.title === '' && probed.missing.includes('title'), probed);
    }

    const nonsense = applyProfile(
        '<html><body><script type="application/ld+json">{ not json </script></body></html>',
        { title: { kind: 'jsonLd', path: 'name' } }
    );
    check('unparseable structured data is a miss', nonsense.missing.includes('title'), nonsense);

    /* ------------------------------------------------------------- validation */

    suite('siteProfile: what a model is allowed to say');

    check('a known strategy validates', profileSchema.safeParse(profile).success);
    check(
        'an invented strategy does not',
        !profileSchema.safeParse({ ingredients: { kind: 'evaluate', code: 'fetch(1)' } }).success
    );
    check(
        'a heading the length of a paragraph does not',
        !profileSchema.safeParse({ ingredients: { kind: 'listAfterHeading', heading: 'x'.repeat(200) } }).success
    );
    check(
        'an empty heading does not',
        !profileSchema.safeParse({ ingredients: { kind: 'listAfterHeading', heading: '   ' } }).success
    );
    check(
        'a selector without a take does not',
        !profileSchema.safeParse({ ingredients: { kind: 'selector', selector: '.a' } }).success
    );

    /*
     * A profile that finds a title and a picture but no food is not a profile,
     * and storing one would mean every later import from that site quietly
     * returned an empty recipe without ever asking a model again.
     */
    check('a profile needs food in it', !isUsefulProfile({ title: { kind: 'meta', property: 'og:title' } }));
    check('ingredients alone are not enough', !isUsefulProfile({ ingredients: profile.ingredients }));
    check('ingredients and method are', isUsefulProfile(profile));

    /* ----------------------------------------------------------------- shapes */

    suite('siteProfile: shapes');

    // A strategy returning many lines for the method returns the steps, and
    // they are numbered the same way the JSON-LD path numbers them, so the
    // recipe form never has to know which path filled it in.
    const stepwise = applyProfile(
        '<html><body><h2>Zubereitung</h2><ul><li>Schneiden.</li><li>Braten.</li><li>Servieren.</li></ul></body></html>',
        { method: { kind: 'listAfterHeading', heading: 'Zubereitung' } }
    );
    check('a stepwise method is numbered', stepwise.method.startsWith('1. Schneiden.'), stepwise.method);
    check('and keeps every step', stepwise.method.includes('3. Servieren.'), stepwise.method);

    const empty = applyProfile('<html><body></body></html>', profile);
    check('an empty page reports every field missing', empty.missing.length === 4, empty.missing);

    // A profile that names nothing reads nothing and complains about nothing —
    // which is why `isUsefulProfile` is checked before one is ever stored.
    equal('an empty profile is inert', applyProfile(page, {}).missing.length, 0);
}
