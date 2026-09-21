import { suite, equal, check } from './harness';
import { extractRecipeFromHtml } from '../src/lib/recipeFromHtml';

/**
 * The import, against the ways real sites actually write schema.org/Recipe.
 *
 * The specification allows almost every field to be a string, an array, or an
 * object, and sites use all three — often within one page. These cases are the
 * shapes that turn up in the wild: a yield that is "4 Portionen" rather than
 * 4, a method that is one HTML blob, an image that is an ImageObject inside an
 * array, a page with three JSON-LD blocks of which one is broken.
 *
 * Every case is written as what *should* happen rather than as what the code
 * currently does, so a failure here is information rather than noise.
 */

/** Wraps a recipe object in the page it would arrive inside. */
function page(recipe: unknown, extraHead = ''): string {
    return `<!DOCTYPE html><html><head>${extraHead}<script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body></body></html>`;
}

const BASE = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Testgericht',
    recipeIngredient: ['200 g Mehl'],
    recipeInstructions: 'Rühren.',
};

export default function importVariantTests() {
    suite('import: how many portions');

    const yields: [unknown, number | null, string][] = [
        [4, 4, 'a plain number'],
        ['4', 4, 'a number as a string'],
        ['4 servings', 4, 'English with a unit'],
        ['4 Portionen', 4, 'German with a unit'],
        ['Für 4 Personen', 4, 'German as a sentence'],
        ['4-6 Portionen', 4, 'a range takes the lower bound'],
        [['4 servings', '4'], 4, 'an array, as Google recommends'],
        ['12 Stück', 12, 'a count of pieces'],
        ['', null, 'empty means unknown'],
        ['viele', null, 'words alone mean unknown'],
        [undefined, null, 'absent means unknown'],
    ];

    for (const [value, expected, why] of yields) {
        const recipe = extractRecipeFromHtml(page({ ...BASE, recipeYield: value }));
        equal(`${why}: ${JSON.stringify(value)}`, recipe.servings, expected);
    }

    suite('import: how long it takes');

    const durations: [string, number | null, string][] = [
        ['PT20M', 20, 'minutes'],
        ['PT1H', 60, 'a whole hour'],
        ['PT1H30M', 90, 'hours and minutes'],
        ['PT2H15M', 135, 'more than two hours'],
        ['P0DT1H30M', 90, 'with a zero day part, which some CMSs emit'],
        // Deliberately null rather than 0: a recipe that says it takes no
        // preparation is saying nothing useful, and "0 Min" on the page would
        // be worse than an absent line.
        ['PT0M', null, 'explicitly nothing is treated as unknown'],
        ['', null, 'empty means unknown'],
        ['about an hour', null, 'prose means unknown'],
    ];

    for (const [value, expected, why] of durations) {
        const recipe = extractRecipeFromHtml(page({ ...BASE, prepTime: value }));
        equal(`${why}: ${value || '(empty)'}`, recipe.prepMinutes, expected);
    }

    suite('import: the picture');

    const images: [unknown, string, string][] = [
        ['https://e.example/a.jpg', 'https://e.example/a.jpg', 'a plain string'],
        [['https://e.example/a.jpg', 'https://e.example/b.jpg'], 'https://e.example/a.jpg', 'an array takes the first'],
        [{ '@type': 'ImageObject', url: 'https://e.example/c.jpg' }, 'https://e.example/c.jpg', 'an ImageObject'],
        [{ '@type': 'ImageObject', contentUrl: 'https://e.example/d.jpg' }, 'https://e.example/d.jpg', 'contentUrl instead of url'],
        [[{ '@type': 'ImageObject', url: 'https://e.example/e.jpg' }], 'https://e.example/e.jpg', 'an ImageObject inside an array'],
        [{}, '', 'an object with nothing usable'],
        [[], '', 'an empty array'],
    ];

    for (const [value, expected, why] of images) {
        const recipe = extractRecipeFromHtml(page({ ...BASE, image: value }));
        equal(why, recipe.imageUrl, expected);
    }

    suite('import: the method');

    const oneBlob = extractRecipeFromHtml(
        page({
            ...BASE,
            recipeInstructions:
                '<p>Zwiebeln schneiden.</p><p>In Butter anbraten.</p><p>Mit Br&uuml;he abl&ouml;schen.</p>',
        })
    );
    equal('an HTML blob becomes three steps', (oneBlob.instructions.match(/^\d+\./gm) ?? []).length, 3);
    check('and its entities are decoded', oneBlob.instructions.includes('Brühe'), oneBlob.instructions);

    const withBreaks = extractRecipeFromHtml(
        page({ ...BASE, recipeInstructions: 'Schritt eins<br>Schritt zwei<br/>Schritt drei' })
    );
    equal('line breaks are step boundaries', (withBreaks.instructions.match(/^\d+\./gm) ?? []).length, 3);

    const sections = extractRecipeFromHtml(
        page({
            ...BASE,
            recipeInstructions: [
                {
                    '@type': 'HowToSection',
                    name: 'Teig',
                    itemListElement: [
                        { '@type': 'HowToStep', text: 'Mehl abwiegen.' },
                        { '@type': 'HowToStep', text: 'Wasser dazu.' },
                    ],
                },
                {
                    '@type': 'HowToSection',
                    name: 'Füllung',
                    itemListElement: [{ '@type': 'HowToStep', text: 'Käse reiben.' }],
                },
            ],
        })
    );
    equal('sections are flattened into one list', (sections.instructions.match(/^\d+\./gm) ?? []).length, 3);
    check('keeping every step', sections.instructions.includes('Käse reiben.'), sections.instructions);

    const namedOnly = extractRecipeFromHtml(
        page({
            ...BASE,
            recipeInstructions: [
                { '@type': 'HowToStep', name: 'Ofen vorheizen' },
                { '@type': 'HowToStep', name: 'Backen' },
            ],
        })
    );
    equal('steps with only a name still count', (namedOnly.instructions.match(/^\d+\./gm) ?? []).length, 2);

    const alreadyNumbered = extractRecipeFromHtml(
        page({ ...BASE, recipeInstructions: ['1. Rühren.', '2. Backen.'] })
    );
    check(
        'a step that already carries a number does not end up numbered twice',
        !/^\d+\.\s*\d+\./m.test(alreadyNumbered.instructions),
        alreadyNumbered.instructions
    );

    suite('import: the ingredients');

    const ingredients = extractRecipeFromHtml(
        page({
            ...BASE,
            recipeIngredient: [
                '400 g Sp&auml;tzle',
                '2-3 Zwiebeln',
                '½ TL Salz',
                'Pfeffer nach Geschmack',
                '',
                '   ',
            ],
        })
    );

    equal('blank lines are dropped', ingredients.ingredients.length, 4);
    equal('entities are decoded', ingredients.ingredients[0].item, 'Spätzle');
    equal('a range keeps both ends', ingredients.ingredients[1].amount, '2-3');
    // Normalised to ASCII on purpose: "1/2" is what the scaler multiplies and
    // what a search for it matches, and the display formatter renders it back.
    equal('a unicode fraction is normalised, not lost', ingredients.ingredients[2].amount, '1/2 TL');
    equal('an ingredient with no amount keeps its name', ingredients.ingredients[3].item, 'Pfeffer nach Geschmack');

    const notAnArray = extractRecipeFromHtml(page({ ...BASE, recipeIngredient: '200 g Mehl' }));
    check(
        'a single string is still read as an ingredient',
        notAnArray.ingredients.length >= 1,
        notAnArray.ingredients
    );

    suite('import: finding the recipe at all');

    equal(
        'a @type array containing Recipe',
        extractRecipeFromHtml(page({ ...BASE, '@type': ['Recipe', 'NewsArticle'] })).title,
        'Testgericht'
    );
    equal(
        'a lowercase @type',
        extractRecipeFromHtml(page({ ...BASE, '@type': 'recipe' })).title,
        'Testgericht'
    );
    equal(
        'nested in a @graph',
        extractRecipeFromHtml(page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, BASE] })).title,
        'Testgericht'
    );
    equal(
        'nested in mainEntity',
        extractRecipeFromHtml(page({ '@type': 'WebPage', mainEntity: BASE })).title,
        'Testgericht'
    );
    equal(
        'a top-level array of nodes',
        extractRecipeFromHtml(page([{ '@type': 'Organization' }, BASE])).title,
        'Testgericht'
    );

    // Real pages carry several blocks and any one of them may be malformed.
    const mixed =
        '<html><head>' +
        '<script type="application/ld+json">{"@type":"Organization","name":"Blog"}</script>' +
        '<script type="application/ld+json">{ this is not json }</script>' +
        `<script type="application/ld+json">${JSON.stringify(BASE)}</script>` +
        '</head><body></body></html>';
    equal('a broken block does not stop the good one being found', extractRecipeFromHtml(mixed).title, 'Testgericht');

    suite('import: giving up cleanly');

    for (const [html, why] of [
        ['', 'empty input'],
        ['<html></html>', 'a page with nothing in it'],
        ['<script type="application/ld+json">null</script>', 'a block that is literally null'],
        ['<script type="application/ld+json">[]</script>', 'an empty array'],
        ['<script type="application/ld+json">"just a string"</script>', 'a string where an object belongs'],
        ['<script type="application/ld+json">{"@type":"Recipe"}</script>', 'a Recipe with no fields at all'],
    ] as [string, string][]) {
        const recipe = extractRecipeFromHtml(html);
        check(`${why}: returns a usable empty recipe`, Array.isArray(recipe.ingredients), recipe);
        check(`${why}: invents no ingredients`, recipe.ingredients.length === 0, recipe.ingredients);
        check(`${why}: invents no servings`, recipe.servings === null, recipe.servings);
    }

    // A page can be large and deeply nested; neither may hang the import.
    const deep = { '@context': 'https://schema.org', '@graph': [BASE] };
    let wrapped: unknown = deep;
    for (let i = 0; i < 12; i += 1) wrapped = { '@type': 'WebPage', mainEntity: wrapped };
    check(
        'a recipe buried deeper than the search goes is simply not found, not a crash',
        typeof extractRecipeFromHtml(page(wrapped)).title === 'string',
        true
    );

    const huge = page({ ...BASE, description: 'x'.repeat(200_000) });
    check('a very large block is handled', extractRecipeFromHtml(huge).title === 'Testgericht', true);

    suite('import: nothing structured, only meta tags');

    const ogOnly = extractRecipeFromHtml(
        '<html><head>' +
        '<meta property="og:title" content="Omelett">' +
        '<meta property="og:description" content="Schnell gemacht">' +
        '<meta property="og:image" content="https://e.example/o.jpg">' +
        '</head><body></body></html>'
    );
    equal('the title comes from og:title', ogOnly.title, 'Omelett');
    equal('the picture from og:image', ogOnly.imageUrl, 'https://e.example/o.jpg');
    equal('and no ingredients are invented', ogOnly.ingredients.length, 0);

    // Attribute order and quoting vary; an importer that only reads one shape
    // fails on half the web.
    const oddMeta = extractRecipeFromHtml(
        `<html><head><meta content='Pfannkuchen' property="og:title"></head></html>`
    );
    equal('attributes in the other order, single-quoted', oddMeta.title, 'Pfannkuchen');
}
