/** Doubles in the ingredient catalogue, found without AI */
import { suite, check, equal } from './harness';
import { findDoubles, pairKey } from '../src/lib/ingredientDoubles';

export default function ingredientDoublesTests() {
    suite('ingredient doubles: found by rules');
    const items = [
        { id: 1, de: 'Ingwer', en: 'ginger' },
        { id: 2, de: 'frischer Ingwer', en: '' },
        { id: 3, de: 'Frühlingszwiebeln', en: '' },
        { id: 4, de: 'Frühlingzwiebeln', en: '' },
        { id: 5, de: '', en: 'Tofu' },
        { id: 6, de: 'Tofu', en: '' },
        { id: 7, de: 'Zucker', en: 'sugar' },
        { id: 8, de: 'Salz', en: 'salt' },
        { id: 9, de: 'Kokosmilch', en: 'coconut milk' },
        { id: 10, de: 'Milch', en: 'milk' },
        { id: 11, de: 'Paprika', en: 'bell pepper' },
        { id: 12, de: 'Paprikapulver', en: 'paprika' },
    ];
    const found = findDoubles(items);
    const has = (a: number, b: number) => found.some((pair) => pairKey(pair.a, pair.b) === pairKey(a, b));
    check('one inside the other', has(1, 2));
    check('a typo apart', has(3, 4));
    check('the same name in two languages', has(5, 6));
    check('sugar and salt are not', !has(7, 8));
    check('milk inside coconut milk is not', !has(9, 10));
    check('a false friend between two complete ones is not', !has(11, 12));
    equal('nothing else', found.length, 3);
    check('"not the same" is remembered', !findDoubles(items, new Set([pairKey(1, 2)])).some((pair) => pairKey(pair.a, pair.b) === pairKey(1, 2)));
}
