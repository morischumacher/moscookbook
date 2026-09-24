import { suite, equal, check } from './harness';
import { isoDuration, instructionSteps, buildRecipeJsonLd } from '../src/lib/recipeJsonLd';
import { extractRecipeFromHtml } from '../src/lib/recipeFromHtml';
import type { StructuredIngredient } from '../src/lib/ingredientParts';

const INGREDIENTS: StructuredIngredient[] = [
    { quantity: 400, quantityMax: null, unit: 'g', name: 'Spätzle', raw: '400 g' },
    { quantity: 200, quantityMax: null, unit: 'g', name: 'Bergkäse', raw: '200 g' },
    { quantity: 2, quantityMax: 3, unit: null, name: 'Zwiebeln', raw: '2-3' },
    { quantity: null, quantityMax: null, unit: null, name: 'Salz', raw: '' },
];

const RECIPE = {
    title: 'Käsespätzle',
    description: 'Schwäbische Spätzle mit Bergkäse.',
    instructions: '1. Zwiebeln rösten.\n2. Spätzle kochen.\n3. Alles schichten.',
    category: 'Dinner',
    nationality: 'German',
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 90,
    createdAt: new Date('2026-09-21T10:00:00.000Z'),
    images: [{ url: 'https://example.com/kaesespaetzle.jpg' }],
    ingredients: INGREDIENTS,
    // Three ratings: 5, 4 and 4.
    rating: { count: 3, sum: 13 },
    url: 'https://www.moscookbook.com/de/recipe/kaesespaetzle',
};

export default function recipeJsonLdTests() {
    suite('isoDuration');

    equal('minutes alone', isoDuration(20), 'PT20M');
    equal('a whole hour drops the minutes', isoDuration(60), 'PT1H');
    equal('hours and minutes', isoDuration(90), 'PT1H30M');
    equal('zero is still valid', isoDuration(0), 'PT0M');

    suite('instructionSteps');

    equal(
        'splits a numbered list and drops the numbers',
        instructionSteps('1. Zwiebeln rösten.\n2. Spätzle kochen.'),
        ['Zwiebeln rösten.', 'Spätzle kochen.']
    );
    equal(
        'splits a dashed list',
        instructionSteps('- Zwiebeln rösten.\n- Spätzle kochen.'),
        ['Zwiebeln rösten.', 'Spätzle kochen.']
    );
    equal(
        'splits paragraphs',
        instructionSteps('Zwiebeln rösten.\n\nSpätzle kochen.'),
        ['Zwiebeln rösten.', 'Spätzle kochen.']
    );
    equal(
        'keeps a multi-line paragraph together',
        instructionSteps('Zwiebeln schneiden\nund in Butter rösten.'),
        ['Zwiebeln schneiden\nund in Butter rösten.']
    );
    equal('survives an empty method', instructionSteps(''), []);

    suite('buildRecipeJsonLd');

    const data = buildRecipeJsonLd(RECIPE);

    equal('declares itself a Recipe', data['@type'], 'Recipe');
    equal('carries the name', data.name, 'Käsespätzle');
    equal('carries the yield as a string, as schema.org wants', data.recipeYield, '4');
    equal('converts the times', data.prepTime, 'PT20M');
    equal('and the long one', data.cookTime, 'PT1H30M');
    equal('and adds them up', data.totalTime, 'PT1H50M');

    equal(
        'writes ingredients the way a person reads them',
        data.recipeIngredient,
        ['400 g Spätzle', '200 g Bergkäse', '2-3 Zwiebeln', 'Salz']
    );

    const rating = data.aggregateRating as Record<string, unknown>;
    equal('averages the ratings', rating.ratingValue, 4.33);
    equal('and counts them', rating.ratingCount, 3);

    // Absent is better than wrong: "0 servings" and "PT0M" are read as facts.
    const sparse = buildRecipeJsonLd({
        ...RECIPE,
        description: null,
        category: null,
        nationality: null,
        servings: null,
        prepMinutes: null,
        cookMinutes: null,
        images: [],
        rating: { count: 0, sum: 0 },
    });

    check('leaves out an unknown yield', !('recipeYield' in sparse), Object.keys(sparse));
    check('leaves out unknown times', !('prepTime' in sparse) && !('totalTime' in sparse), Object.keys(sparse));
    check('leaves out an empty rating', !('aggregateRating' in sparse), Object.keys(sparse));
    check('leaves out a missing picture', !('image' in sparse), Object.keys(sparse));
    check('but still has a name and a method', Boolean(sparse.name) && Boolean(sparse.recipeInstructions), sparse);

    suite('the markup cannot break out of its script tag');

    // Not hypothetical: the capture inbox takes titles from whatever page was
    // shared, so a recipe's name can be anything a stranger's site contained.
    // The page renders this JSON inside <script>, where the only way out is a
    // literal closing tag.
    const hostile = buildRecipeJsonLd({
        ...RECIPE,
        title: 'Kuchen </script><img src=x onerror=alert(1)>',
    });
    const rendered = JSON.stringify(hostile).replace(/</g, '\\u003c');

    check('no closing tag survives', !rendered.includes('</script>'), rendered.slice(0, 80));
    check('and no opening one either', !rendered.includes('<'), rendered.slice(0, 80));
    equal(
        'while the title still reads correctly once parsed',
        (JSON.parse(rendered) as { name: string }).name,
        'Kuchen </script><img src=x onerror=alert(1)>'
    );

    suite('round trip: our own importer reads our own markup');

    // The strongest check available: the markup is fed to the extractor this
    // application uses on other people's sites. If the cookbook cannot import
    // from itself, the markup is wrong.
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`;
    const imported = extractRecipeFromHtml(html, RECIPE.url);

    equal('the title survives', imported.title, 'Käsespätzle');
    equal('the description survives', imported.description, 'Schwäbische Spätzle mit Bergkäse.');
    equal('every ingredient survives', imported.ingredients.length, 4);
    equal('with its amount', imported.ingredients[0].amount, '400 g');
    equal('and its name', imported.ingredients[0].item, 'Spätzle');
    equal('a range survives', imported.ingredients[2].amount, '2-3');
    equal('an ingredient with no amount survives', imported.ingredients[3].item, 'Salz');
    equal('the servings survive', imported.servings, 4);
    equal('the prep time survives', imported.prepMinutes, 20);
    equal('the cooking time survives', imported.cookMinutes, 90);
    equal('the category survives', imported.category, 'Dinner');
    equal('the cuisine survives', imported.nationality, 'German');
    equal('the picture survives', imported.imageUrl, 'https://example.com/kaesespaetzle.jpg');
    check(
        'and so does every step of the method',
        ['Zwiebeln rösten.', 'Spätzle kochen.', 'Alles schichten.'].every((step) =>
            imported.instructions.includes(step)
        ),
        imported.instructions
    );
}
