/** The shopping list: same things become one line, sorted by where they are in a shop */
import { suite, check, equal } from './harness';
import { apiAccess, pathAccess } from '../src/lib/accessRules';
import { aisleOf, amountLabel, lineFromText, linesFor, listAsText, mergeInto, shoppingKey } from '../src/lib/shopping';

const row = (name: string, quantity: number | null, unit: string | null, quantityMax: number | null = null) => ({
    name,
    quantity,
    quantityMax,
    unit,
});

export default function shoppingTests() {
    suite('shopping: what counts as the same thing');
    equal('plural and singular', shoppingKey('Zwiebeln'), shoppingKey('Zwiebel'));
    equal('the preparation is not part of it', shoppingKey('Zwiebeln, fein gehackt'), shoppingKey('Zwiebel'));
    equal('nor what is in brackets', shoppingKey('Butter (weich)'), shoppingKey('Butter'));
    check('red onions are not onions', shoppingKey('rote Zwiebeln') !== shoppingKey('Zwiebeln'));

    suite('shopping: where it is in the shop');
    equal('onions with the vegetables', aisleOf('Zwiebeln'), 'produce');
    equal('paprika powder with the spices, not the peppers', aisleOf('Paprikapulver'), 'spices');
    equal('cheese in the fridge', aisleOf('Bergkäse'), 'dairy');
    equal('eggs too', aisleOf('Eier'), 'dairy');
    equal('flour on the shelf', aisleOf('Mehl'), 'pantry');
    equal('Spätzle with the pasta', aisleOf('Spätzle'), 'pantry');
    equal('salt is a basic', aisleOf('Salz'), 'basics');
    equal('chicken at the counter', aisleOf('chicken thighs'), 'meat');

    suite('shopping: a recipe becomes lines');
    const spaetzle = linesFor([row('Spätzle', 400, 'g'), row('Bergkäse', 200, 'g'), row('Zwiebeln', 2, null), row('Wasser', 1, 'l'), row('Salz', null, null)], 1.5, 'Käsespätzle');
    equal('water is never bought', spaetzle.length, 4);
    equal('amounts are scaled to the servings being cooked', spaetzle[0].amount, 600);
    equal('and remember the recipe', spaetzle[0].source, 'Käsespätzle');
    equal('an ingredient with no amount is still on the list', spaetzle[3].amount, null);

    suite('shopping: lines from several recipes become one');
    const curry = linesFor([row('Zwiebel', 1, null), row('Bergkäse', 0.1, 'kg'), row('chopped onions', 1, 'cup')], 1, 'Curry');
    const first = mergeInto([], spaetzle);
    equal('a recipe on an empty list makes its lines', first.creates.length, 4);

    const existing = first.creates.map((line, index) => ({ id: index + 1, key: line.key, measure: line.measure, amount: line.amount, sources: line.sources, checked: false }));
    const second = mergeInto(existing, curry);
    const onions = second.updates.find((update) => update.id === 3);
    equal('onions from two recipes add up', onions?.amount, 4);
    equal('and say who they are for', onions?.sources, ['Käsespätzle', 'Curry']);
    const cheese = second.updates.find((update) => update.id === 2);
    equal('grams and kilograms of the same cheese add up', cheese?.amount, 400);
    equal('a cup of onions cannot be added to whole onions', second.creates.length, 1);

    const bought = existing.map((line) => (line.id === 3 ? { ...line, checked: true } : line));
    const third = mergeInto(bought, curry);
    check('what was already bought is not added to', !third.updates.some((update) => update.id === 3));

    const twice = mergeInto([], [...linesFor([row('Eier', 2, null)], 1, 'A'), ...linesFor([row('Eier', 3, null)], 1, 'B')]);
    equal('within one addition, too', twice.creates.length, 1);
    equal('six... five eggs', twice.creates[0].amount, 5);

    suite('shopping: typed by hand');
    equal('"500 g Mehl"', lineFromText('500 g Mehl'), { name: 'Mehl', key: 'mehl', measure: 'mass', amount: 500, aisle: 'pantry', source: null });
    equal('"2 Zitronen"', lineFromText('2 Zitronen')?.amount, 2);
    equal('"Klopapier"', lineFromText('Klopapier')?.amount, null);
    equal('which goes under other', lineFromText('Klopapier')?.aisle, 'other');

    suite('shopping: read back');
    equal('grams', amountLabel('mass', 700, 'de'), '700 g');
    equal('a kilo and a half', amountLabel('mass', 1500, 'de'), '1,5 kg');
    equal('spoons', amountLabel('spoon', 30, 'de'), '2 EL');
    equal('onions', amountLabel('count:', 4, 'de'), '4');
    equal('nothing for "Salz"', amountLabel(null, null, 'de'), '');

    const text = listAsText(
        [
            { name: 'Mehl', measure: 'mass', amount: 500, aisle: 'pantry', checked: false },
            { name: 'Zwiebeln', measure: 'count:', amount: 2, aisle: 'produce', checked: false },
            { name: 'Butter', measure: 'mass', amount: 250, aisle: 'dairy', checked: true },
        ],
        (aisle) => aisle.toUpperCase(),
        'de'
    );
    check('as text, in shop order, without what is bought', text === 'PRODUCE\n- 2 Zwiebeln\n\nPANTRY\n- 500 g Mehl', text);

    suite('shopping: who can reach it');
    equal('your own list needs an account', apiAccess('/api/shopping'), 'session');
    equal('and so does ticking on it', apiAccess('/api/shopping/12'), 'session');
    equal('a shared list is open to its link', apiAccess('/api/shopping/shared/abcdefghijklmnop1234'), 'open');
    equal('but not to anything shorter than a token', apiAccess('/api/shopping/shared/x'), 'session');
    equal('the shared page is open', pathAccess('/de/s/abcdefghijklmnop1234'), 'open');
    equal('your own page is not', pathAccess('/de/shopping'), 'account');
}
