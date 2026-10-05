/** One ingredient by one name in both languages, for the shopping list */
import { suite, check, equal } from './harness';
import { commonIngredient, displayName, ingredientKey } from '../src/lib/ingredientNames';
import { linesFor, mergeInto } from '../src/lib/shopping';

export default function ingredientNamesTests() {
    suite('ingredient names: the same thing in German and English');
    equal('Frühlingszwiebeln', ingredientKey('Frühlingszwiebeln'), 'ing:spring-onion');
    equal('green onions/scallions', ingredientKey('green onions/scallions'), 'ing:spring-onion');
    equal('a preparation does not matter', ingredientKey('Frühlingszwiebeln, in Ringen'), 'ing:spring-onion');
    equal('ginger and Ingwer', ingredientKey('ginger'), ingredientKey('Ingwer'));
    equal('fresh grated ginger', ingredientKey('fresh grated ginger'), 'ing:ginger');
    equal('neutral oil is vegetable oil', ingredientKey('vegetable oil'), ingredientKey('neutrales Öl'));
    equal('eggs and Eier', ingredientKey('eggs'), ingredientKey('Eier'));
    check('two different things are no one thing', commonIngredient('chicken breast or firm tofu') === null);
    check('an unknown ingredient keeps its own key', !ingredientKey('Yuzu-Kosho').startsWith('ing:'));
    check('a red onion is not an onion', ingredientKey('red onion') !== ingredientKey('onion'));

    suite('ingredient names: shown in the reader\'s language');
    equal('in German', displayName('green onions/scallions', 'de', 14, 'count:'), 'Frühlingszwiebeln');
    equal('in English', displayName('Frühlingszwiebeln', 'en', 2, 'count:bund'), 'spring onions');
    equal('one piece is singular', displayName('Zwiebeln', 'de', 1, 'count:'), 'Zwiebel');
    equal('anything else as written', displayName('Yuzu-Kosho', 'de', 1, 'count:'), 'Yuzu-Kosho');

    suite('ingredient names: one line on the list');
    const english = linesFor([{ name: 'ginger', quantity: 20, quantityMax: null, unit: 'g' }], 1, 'Agedashi Tofu');
    const german = linesFor([{ name: 'Ingwer', quantity: 150, quantityMax: null, unit: 'g' }], 1, 'Crispy Chili-Öl');
    const plan = mergeInto([], [...english, ...german]);
    equal('ginger and Ingwer in grams add up', plan.creates.length, 1);
    equal('to 170 g', plan.creates[0]?.amount, 170);
    equal('for both recipes', plan.creates[0]?.sources, ['Agedashi Tofu', 'Crispy Chili-Öl']);
}
