import { suite, equal, check } from './harness';
import { parseIngredientQuery, variantsOf } from '../src/lib/ingredientSearch';

export default function ingredientSearchTests() {
    suite('parseIngredientQuery');

    equal('splits on commas', parseIngredientQuery('Zucchini, Feta'), ['zucchini', 'feta']);
    equal('splits on spaces', parseIngredientQuery('Zucchini Feta'), ['zucchini', 'feta']);
    equal('splits on "und"', parseIngredientQuery('Zucchini und Feta'), ['zucchini', 'feta']);
    equal('splits on "and"', parseIngredientQuery('zucchini and feta'), ['zucchini', 'feta']);
    equal('handles a mixture', parseIngredientQuery('Zucchini, Feta und Olivenöl'), [
        'zucchini',
        'feta',
        'olivenöl',
    ]);

    equal('strips punctuation around a word', parseIngredientQuery('"Feta".'), ['feta']);
    equal('keeps a hyphenated word whole enough to match', parseIngredientQuery('Crème-fraîche').length, 2);

    // Words that would match every recipe in the book.
    equal('drops filler', parseIngredientQuery('etwas frische Petersilie'), ['petersilie']);
    equal('drops a word that is too short to mean anything', parseIngredientQuery('Ei und Öl'), []);
    equal('returns nothing for an empty query', parseIngredientQuery('   '), []);
    equal('returns nothing for punctuation', parseIngredientQuery('!!! ,,,'), []);

    // Asking for the same thing twice must not be harder to satisfy than
    // asking once.
    equal('deduplicates', parseIngredientQuery('Feta, feta, FETA'), ['feta']);

    // One paste must not turn into forty joins.
    const many = parseIngredientQuery(
        'eins zwei drei vier fuenf sechs sieben acht neun zehn elf zwoelf'
    );
    check('caps how many words it will ask about', many.length <= 6, many.length);

    suite('variantsOf');

    // What was typed always comes first, so an exact match is always tried.
    check('always includes the word itself', variantsOf('feta').includes('feta'));

    const onions = variantsOf('zwiebeln');
    check('offers the singular as well', onions.includes('zwiebel'), onions);

    const herbs = variantsOf('kräuter');
    check('offers the ae spelling', herbs.includes('kraeuter'), herbs);
    check('and the ae spelling without its plural', herbs.includes('kraeut'), herbs);

    // Typing the ae spelling has to work in the other direction too: the
    // ingredient in the database is written with the umlaut.
    check('leaves an ae spelling alone', variantsOf('kaese').includes('kaese'));

    // The guard that keeps "Eis" from becoming "Ei" belongs here as well —
    // asking for ice cream must not match every recipe with an egg in it.
    check('never turns Eis into Ei', !variantsOf('eis').includes('ei'), variantsOf('eis'));

    check('has no duplicates', new Set(variantsOf('zwiebeln')).size === variantsOf('zwiebeln').length);
    check('case does not matter', variantsOf('FETA').includes('feta'));
}
