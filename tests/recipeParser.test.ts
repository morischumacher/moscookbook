/** recipeParser (paste & parse) */
import { parseRecipeText, parseIngredientLine } from '../src/lib/recipeParser';
import { suite, check } from './harness';

export default function run() {

    suite('parseIngredientLine');
    const cases: [string, string, string][] = [
        ['200 g Mehl', '200 g', 'Mehl'],
        ['200g Mehl', '200 g', 'Mehl'],
        ['- 250 ml Milch', '250 ml', 'Milch'],
        ['• 2 EL Olivenöl', '2 EL', 'Olivenöl'],
        ['2-3 EL Olivenöl', '2-3 EL', 'Olivenöl'],
        ['1,5 kg Kartoffeln', '1,5 kg', 'Kartoffeln'],
        ['1/2 TL Salz', '1/2 TL', 'Salz'],
        ['½ TL Salz', '1/2 TL', 'Salz'],
        ['1 1/2 Tassen Zucker', '1 1/2 Tassen', 'Zucker'],
        ['ca. 100 g Butter', '100 g', 'Butter'],
        ['3 Eier', '3', 'Eier'],
        ['2 Zehen Knoblauch', '2 Zehen', 'Knoblauch'],
        ['Prise Salz', 'Prise', 'Salz'],
        ['1 Prise Muskat', '1 Prise', 'Muskat'],
        ['etwas Öl', 'etwas', 'Öl'],
        ['Salz', '', 'Salz'],
        ['Pfeffer, frisch gemahlen', '', 'Pfeffer, frisch gemahlen'],
        ['2 cups flour', '2 cups', 'flour'],
        ['1 tbsp olive oil', '1 tbsp', 'olive oil'],
        ['a handful of parsley', '', 'a handful of parsley'],
        ['4 slices of bread', '4 slices', 'bread'],
    ];
    for (const [input, amount, item] of cases) {
        const got = parseIngredientLine(input);
        check(`"${input}"`, got.amount === amount && got.item === item, got);
    }

    suite('parseRecipeText — German with headings');
    const german = `Käsespätzle

    Ein Klassiker aus Schwaben, schnell gemacht.

    Zutaten
    - 400 g Spätzle
    - 200 g Bergkäse, gerieben
    - 2 Zwiebeln
    - 50 g Butter
    - Salz
    - Pfeffer

    Zubereitung
    1. Zwiebeln in Ringe schneiden und in Butter goldbraun braten.
    2. Spätzle in Salzwasser kochen, abgießen.
    3. Spätzle und Käse abwechselnd schichten, mit Zwiebeln servieren.`;

    const g = parseRecipeText(german);
    check('title', g.title === 'Käsespätzle', g.title);
    check('description', g.description.startsWith('Ein Klassiker'), g.description);
    check('6 ingredients', g.ingredients.length === 6, g.ingredients);
    check('first ingredient', g.ingredients[0].amount === '400 g' && g.ingredients[0].item === 'Spätzle', g.ingredients[0]);
    check('salt has no amount', g.ingredients[4].amount === '' && g.ingredients[4].item === 'Salz', g.ingredients[4]);
    check('3 numbered steps', (g.instructions.match(/^\d+\./gm) || []).length === 3, g.instructions);
    check('step text kept', g.instructions.includes('goldbraun braten'), g.instructions);

    suite('parseRecipeText — English, no headings');
    const english = `Banana Bread

    3 ripe bananas
    2 cups flour
    1 tsp baking soda
    100 g butter
    150 g sugar

    Preheat the oven to 175°C. Mash the bananas in a large bowl.
    Mix in the butter and sugar, then fold in the flour and baking soda.
    Pour into a loaf tin and bake for 50 minutes.`;

    const e = parseRecipeText(english);
    check('title', e.title === 'Banana Bread', e.title);
    check('5 ingredients', e.ingredients.length === 5, e.ingredients);
    check('bananas', e.ingredients[0].amount === '3' && e.ingredients[0].item === 'ripe bananas', e.ingredients[0]);
    check('instructions captured', e.instructions.includes('Preheat the oven'), e.instructions);
    check('instructions exclude ingredients', !e.instructions.includes('baking soda\n'), e.instructions);

    suite('parseRecipeText — markdown headings and colons');
    const md = `# Tomatensuppe

    ## Zutaten:
    1 kg Tomaten
    1 Zwiebel
    500 ml Gemüsebrühe

    ## Zubereitung:
    Tomaten würfeln. Zwiebel anbraten.
    Brühe zugeben und 20 Minuten köcheln lassen.`;
    const m = parseRecipeText(md);
    check('title without #', m.title === 'Tomatensuppe', m.title);
    check('3 ingredients', m.ingredients.length === 3, m.ingredients);
    check('broth parsed', m.ingredients[2].amount === '500 ml', m.ingredients[2]);
    check('has instructions', m.instructions.includes('köcheln'), m.instructions);

    suite('edge cases');
    check('empty input', parseRecipeText('').ingredients.length === 0);
    check('whitespace only', parseRecipeText('   \n  \n ').title === '');
    const onlyTitle = parseRecipeText('Nur ein Titel');
    check('title only', onlyTitle.title === 'Nur ein Titel' && onlyTitle.ingredients.length === 0, onlyTitle);
    const prose = parseRecipeText('Spiegelei\n\nEi in die Pfanne schlagen und braten bis das Eiweiß fest ist.');
    check('prose without ingredients', prose.ingredients.length === 0 && prose.instructions.length > 10, prose);


}
