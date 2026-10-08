/** One way to write an ingredient: "Zutat, Form (Zusatz) (optional)" */
import { suite, equal, check } from './harness';
import { conventional, conventionalRows, needsReading, shapeOf } from '../src/lib/ingredientShape';
import { linesFor } from '../src/lib/shopping';
import { coreName } from '../src/lib/ingredientCatalog';
import { capitalized } from '../src/lib/ingredientParts';
import { formReadyRows } from '../src/lib/formRows';

export default function ingredientShapeTests() {
    suite('ingredient convention: read');
    equal('all four parts', shapeOf('Knoblauch, gehackt (große Zehen) (optional)'), { base: 'Knoblauch', form: 'gehackt', note: 'große Zehen', optional: true });
    equal('just the ingredient', shapeOf('Salz'), { base: 'Salz', form: '', note: '', optional: false });

    suite('ingredient convention: written the one way');
    const cases: [string, string][] = [
        ['frischer Ingwer', 'Ingwer, frisch'],
        ['fein gehackte Zwiebeln', 'Zwiebeln, fein gehackt'],
        ['thinly sliced red onion', 'Red onion, thinly sliced'],
        ['Butter (weich)', 'Butter, weich'],
        ['large eggs', 'Eggs (large)'],
        ['optional: Chiliflocken', 'Chiliflocken (optional)'],
        ['Koriander (optional, zum Garnieren)', 'Koriander (zum Garnieren) (optional)'],
        ['Petersilie, gehackt, optional', 'Petersilie, gehackt (optional)'],
        ['Knoblauch, gehackt (große Zehen) (optional)', 'Knoblauch, gehackt (große Zehen) (optional)'],
    ];
    for (const [from, to] of cases) equal(`"${from}"`, conventional(from), to);
    for (const [from, to] of cases) equal(`"${to}" stays as it is`, conventional(conventional(from)), to);
    // Other things to buy, not forms of the same one.
    for (const same of ['rote Zwiebel', 'gemahlener Kreuzkümmel', 'frisch gemahlener Pfeffer', 'Frühlingszwiebeln', 'chicken breast or firm tofu']) equal(`"${same}" is left alone but for its capital`, conventional(same), capitalized(same));
    equal('a heading is left alone', conventionalRows([{ amount: '', item: '## Für den Teig' }, { amount: '1', item: 'frischer Ingwer' }]), [{ amount: '', item: '## Für den Teig' }, { amount: '1', item: 'Ingwer, frisch' }]);

    // A comma between adjectives is not the one after the ingredient (work #49).
    equal('"fermentierte, gesalzene Garnelen …" keeps all of it', shapeOf('fermentierte, gesalzene Garnelen mit der salzigen Lauge, gehackt (Saeujeot)').base, 'fermentierte, gesalzene Garnelen mit der salzigen Lauge');
    equal('"smoked, salted bacon, diced"', shapeOf('smoked, salted bacon, diced'), { base: 'smoked, salted bacon', form: 'diced', note: '', optional: false });
    equal('"chicken, boneless" is still chicken', shapeOf('chicken, boneless').base, 'chicken');
    equal('and the shopping list shows all of it', linesFor([{ name: 'fermentierte, gesalzene Garnelen mit der salzigen Lauge, gehackt (Saeujeot)', quantity: 60, quantityMax: null, unit: 'ml' }], 1, 'A')[0].name, 'fermentierte, gesalzene Garnelen mit der salzigen Lauge');

    suite('ingredient convention: what the AI is asked to read once');
    check('a description in place of the ingredient', needsReading('fermentierte, gesalzene Garnelen mit der salzigen Lauge, gehackt (Saeujeot)'));
    check('"Knoblauch, gehackt (große Zehen)" is fine as it is', !needsReading('Knoblauch, gehackt (große Zehen)'));
    check('so is "Salz"', !needsReading('Salz'));
    check('and a heading', !needsReading('## Für den Teig'));

    suite('ingredient convention: what is tracked');
    equal('the catalogue keeps only the ingredient', coreName('frischer Ingwer, gerieben (Bio) (optional)'), 'Ingwer');
    const [chili] = linesFor([{ name: 'Chiliflocken (optional)', quantity: 1, quantityMax: null, unit: 'TL' }], 1, 'A');
    equal('an optional ingredient goes under "Optional"', chili.aisle, 'optional');
    const [needed] = linesFor([{ name: 'Chiliflocken', quantity: 1, quantityMax: null, unit: 'TL' }], 1, 'B');
    equal('and is not added to the one the dish needs', chili.key === needed.key, false);

    suite('ingredient names: German ones as a German list writes them');
    equal('a capital first letter', capitalized('lauchzwiebel'), 'Lauchzwiebel');
    equal('an adjective first too', capitalized('rote Zwiebeln'), 'Rote Zwiebeln');
    equal('an umlaut', capitalized('öl'), 'Öl');
    equal('nothing stays nothing', capitalized('  '), '');
    equal('English names too', conventional('gochugaru'), 'Gochugaru');
    equal('only the first letter', conventional('garlic, minced'), 'Garlic, minced');

    suite('form rows: the cookbook\'s way wherever they come from (work #57)');
    const ready = formReadyRows([{ amount: '2 tsp', item: 'minced garlic' }, { amount: '4 oz', item: 'parmesan' }, { amount: '', item: '## Sauce' }, { amount: '2 Dosen', item: 'Tomaten' }], 'en');
    equal('the preparation out of the name', ready[0].item, 'Garlic, minced');
    equal('ounces in grams', ready[1].amount, '115 g');
    equal('a heading as it is', ready[2].item, '## Sauce');
    equal('a unit of its own as it is', ready[3].amount, '2 Dosen');
    equal('twice is once', formReadyRows(ready, 'en'), ready);
}
