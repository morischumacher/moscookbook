/** A shopping line knows how much is for which recipe, and one ingredient's units become one */
import { suite, check, equal } from './harness';
import { linesFor, mergeInto, removeFrom } from '../src/lib/shopping';
import { DEFAULT_UNITS, buyable, partsOf, simplified, unitsOf, withoutSource } from '../src/lib/shoppingParts';
import { conversionLines, readConversion } from '../src/lib/unitConversion';

const row = (name: string, quantity: number | null, unit: string | null) => ({ name, quantity, quantityMax: null, unit });

export default function shoppingPartsTests() {
    suite('shopping parts: who it is for');
    const tofu = linesFor([row('Frühlingszwiebeln', 7, null)], 1, 'Agedashi Tofu');
    const oil = linesFor([row('Frühlingszwiebeln', 3, null)], 1, 'Chili-Öl');
    const first = mergeInto([], tofu);
    equal('a new line remembers its recipe and amount', first.creates[0].parts, [{ s: 'Agedashi Tofu', a: 7 }]);
    const list = [{ id: 1, key: first.creates[0].key, measure: first.creates[0].measure, amount: 7, sources: ['Agedashi Tofu'], parts: first.creates[0].parts, checked: false }];
    const second = mergeInto(list, oil);
    equal('a second recipe adds its own part', second.updates[0].parts, [{ s: 'Agedashi Tofu', a: 7 }, { s: 'Chili-Öl', a: 3 }]);
    equal('a line from before parts is one part per recipe', partsOf({ sources: ['A'], amount: 2 }), [{ s: 'A', a: 2 }]);
    equal('several, and their shares unknown', partsOf({ sources: ['A', 'B'], amount: 2 }), [{ s: 'A', a: null }, { s: 'B', a: null }]);

    suite('shopping parts: a recipe taken off');
    const both = { measure: 'count:', amount: 10, sources: ['Agedashi Tofu', 'Chili-Öl'], parts: second.updates[0].parts };
    equal('takes exactly its share', withoutSource(both, 'Chili-Öl'), { gone: false, amount: 7, sources: ['Agedashi Tofu'], parts: [{ s: 'Agedashi Tofu', a: 7 }] });
    check('the last one takes the line', withoutSource({ measure: 'count:', amount: 7, sources: ['A'], parts: [{ s: 'A', a: 7 }] }, 'A').gone);
    equal('an old line keeps its amount', withoutSource({ amount: 5, sources: ['A', 'B'] }, 'A').amount, 5);
    const undo = removeFrom([{ id: 1, ...both, key: tofu[0].key, checked: false }], oil);
    equal('"Wieder entfernen" takes the part too', undo.updates[0].parts, [{ s: 'Agedashi Tofu', a: 7 }]);

    suite('shopping parts: an amount and no amount');
    const salt = linesFor([row('Salz', 1, 'TL')], 1, 'A');
    const pinch = linesFor([row('Salz', null, null)], 1, 'B');
    const salted = mergeInto([{ id: 4, key: salt[0].key, measure: salt[0].measure, amount: salt[0].amount, sources: ['A'], parts: [{ s: 'A', a: salt[0].amount }], checked: false }], pinch);
    equal('"Salz" joins "1 TL Salz" rather than standing beside it', [salted.creates.length, salted.updates[0]?.sources], [0, ['A', 'B']]);
    const later = mergeInto([{ id: 5, key: pinch[0].key, measure: null, amount: null, sources: ['B'], parts: [{ s: 'B', a: null }], checked: false }], salt);
    equal('and "1 TL Salz" gives "Salz" its amount', [later.creates.length, later.updates[0]?.measure, later.updates[0]?.amount], [0, 'spoon', 5]);
    const back = removeFrom([{ id: 5, key: pinch[0].key, measure: 'spoon', amount: 5, sources: ['B', 'A'], parts: later.updates[0].parts, checked: false }], salt);
    equal('taking the teaspoon off leaves the salt for B', [back.deletes, back.updates[0]?.amount, back.updates[0]?.sources], [[], null, ['B']]);
    const typed = removeFrom([{ id: 6, key: salt[0].key, measure: 'spoon', amount: 10, sources: ['A'], parts: [{ s: null, a: 5 }, { s: 'A', a: 5 }], checked: false }], salt);
    equal('a line also typed by hand keeps the typed part', [typed.deletes, typed.updates[0]?.amount], [[], 5]);

    suite('shopping parts: one unit');
    const units = DEFAULT_UNITS['spring-onion'];
    const merged = simplified(
        [
            { id: 1, measure: 'count:bund', amount: 2, sources: ['Ingwer-Tee'], parts: [{ s: 'Ingwer-Tee', a: 2 }] },
            { id: 2, measure: 'count:', amount: 14, sources: ['Agedashi Tofu', 'Chili-Öl'], parts: [{ s: 'Agedashi Tofu', a: 7 }, { s: 'Chili-Öl', a: 7 }] },
        ],
        units
    );
    equal('14 spring onions and 2 bunches are 4 bunches', merged?.amount, 4);
    equal('in the unit they are bought in', merged?.measure, 'count:bund');
    equal('the first line is kept, the other goes', [merged?.keep, merged?.drop], [1, [2]]);
    equal('and each recipe keeps its share, converted', merged?.parts, [{ s: 'Ingwer-Tee', a: 2 }, { s: 'Agedashi Tofu', a: 1 }, { s: 'Chili-Öl', a: 1 }]);
    const after = withoutSource({ measure: 'count:bund', amount: merged!.amount, sources: merged!.sources, parts: merged!.parts }, 'Chili-Öl');
    equal('so a recipe taken off after needs no AI', after.amount, 3);
    equal('counted things are rounded up to a half', buyable('count:bund', 1.29), 1.5);
    equal('but not when they are whole', buyable('count:bund', 2.0001), 2);
    equal('one with no known factor stays as it is', simplified([{ id: 1, measure: 'count:dose', amount: 1, sources: [], parts: [] }, { id: 2, measure: 'count:', amount: 1, sources: [], parts: [] }], units), null);
    equal('rounded lines are rounded again from what is left', withoutSource({ measure: 'count:bund', amount: 2.5, sources: ['A', 'B'], parts: [{ s: 'A', a: 2 }, { s: 'B', a: 0.43 }] }, 'B').amount, 2);

    suite('shopping parts: the units an ingredient is bought in');
    equal('the default for a common one', unitsOf({ buyMeasure: null, factors: {} }, 'ginger')?.buy, 'mass');
    equal('its own beats the default', unitsOf({ buyMeasure: 'count:', factors: { mass: 0.02 } }, 'ginger'), { buy: 'count:', factors: { mass: 0.02 } });
    equal('none for one nobody knows', unitsOf({ buyMeasure: null, factors: {} }, null), null);

    suite('shopping parts: written by an admin');
    equal('read back as written', conversionLines(units, 'de'), ['7 Stück = 1 Bund', '7 Stangen = 1 Bund', '100 g = 1 Bund']);
    equal('and read in', readConversion('Bund', ['7 Stück = 1 Bund', '100 g = 1 Bund']), { units: { buy: 'count:bund', factors: { 'count:': 0.142857, mass: 0.01 } } });
    equal('either way round, in English', readConversion('g', ['6 g = 1 tbsp']), { units: { buy: 'mass', factors: { spoon: 0.4 } } });
    equal('a line with no side in the buy unit is refused', readConversion('Bund', ['7 Stück = 100 g']), { error: '7 Stück = 100 g' });
}
