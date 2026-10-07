/** An ingredient's standard unit, conflicts, conversions without AI, and how the form finds a name */
import { suite, check, equal } from './harness';
import { amountIn, conversionText, convertQuantity, factorBetween, isEuropean, rebased, storedFactor, unitFits, measureOf, missingConversions, unitKey, unitLabel, unitState } from '../src/lib/ingredientUnits';
import { brokenGermanName, coreName, followedRows, matchIn, mirroredRows, similarIn, itemKeys, syncedRows } from '../src/lib/ingredientMatch';
import { converted, unitsOf } from '../src/lib/shoppingParts';
import { withGlossary } from '../src/lib/recipeTranslation';

const item = (id: number, de: string, en = '', aliases: string[] = [], enAliases: string[] = []) => ({ id, de, en, aliases, enAliases, keys: itemKeys({ de, en, aliases, enAliases }) });

export default function ingredientUnitsTests() {
    suite('ingredient units: the stored form');
    equal('EL is a tablespoon', unitKey('EL'), 'tbsp');
    equal('Stück is pieces', unitKey('Stück'), '');
    equal('no unit is pieces', unitKey(null), '');
    equal('a can is a word of its own', unitKey('Dose'), 'dose');
    equal('Bund is a bunch', unitKey('Bund'), 'bunch');
    equal('kinds: kg is mass', measureOf('kg'), 'mass');
    equal('kinds: EL is spoon', measureOf('EL'), 'spoon');
    equal('kinds: nothing is pieces', measureOf(''), 'count:');
    equal('the German label', unitLabel('tbsp', 'de'), 'EL');
    equal('pieces in German', unitLabel('', 'de'), 'Stück');

    equal('a replaced amount in English', amountIn('1 Bund', 'en'), '1 bunch');
    equal('and spoons', amountIn('2 EL', 'en'), '2 tbsp');
    equal('a unit of its own stays', amountIn('1 Dose', 'en'), '1 Dose');

    suite('ingredient units: converting without AI');
    equal('kg to g', convertQuantity(0.5, 'kg', 'g', null), 500);
    equal('EL to ml', convertQuantity(2, 'EL', 'ml', null), 30);
    equal('l to ml', convertQuantity(1, 'l', 'ml', null), 1000);
    equal('100 ml are 0.1 l, not half a litre', convertQuantity(100, 'ml', 'l', null), 0.1);
    equal('pieces to grams need the ingredient', convertQuantity(3, '', 'g', null), null);
    const springOnion = { buy: 'count:bund', factors: { 'count:': 1 / 7 } };
    equal('14 spring onions are 2 bunches', convertQuantity(14, '', 'Bund', springOnion), 2);
    equal('one bunch is 7 again', factorBetween('count:bund', 'count:', springOnion), 7);
    equal('the shopping list: spoons to ml with no factor', converted({ measure: 'spoon', amount: 30, parts: [] }, { buy: 'volume', factors: {} })?.amount, 30);

    suite('ingredient units: standard and conflicts');
    equal('one kind: the usual one is the standard', unitState({ unit: null, moreUnits: [] }, [{ unit: 'g', count: 3 }, { unit: 'kg', count: 1 }]), { unit: 'g', chosen: false, odd: [] });
    equal('two kinds, nobody chose: the most used is the main unit, the other a question', unitState({ unit: null, moreUnits: [] }, [{ unit: 'g', count: 3 }, { unit: '', count: 1 }]), { unit: 'g', chosen: false, odd: ['count:'] });
    equal('chosen g, a recipe in pieces: that kind is odd', unitState({ unit: 'g', moreUnits: [] }, [{ unit: 'g', count: 3 }, { unit: '', count: 1 }]).odd, ['count:']);
    equal('on the card without a conversion: still a question', unitState({ unit: 'g', moreUnits: ['count:'] }, [{ unit: 'g', count: 3 }, { unit: '', count: 1 }]).odd, ['count:']);
    equal('on the card with its conversion: fine', unitState({ unit: 'g', moreUnits: ['count:'] }, [{ unit: 'g', count: 3 }, { unit: '', count: 1 }], { buy: 'mass', factors: { 'count:': 150 } }).odd, []);
    equal('a main unit is never cups: the metric one instead', unitState({ unit: null, moreUnits: [] }, [{ unit: 'cups', count: 3 }]).unit, 'ml');
    check('cups never fit, whatever the card', !unitFits({ unit: 'ml', moreUnits: [], units: null }, 'cups'));
    check('TL fits a card in EL (green)', unitFits({ unit: 'tbsp', moreUnits: [], units: null }, 'TL'));
    check('Stück does not fit a card in g', !unitFits({ unit: 'g', moreUnits: [], units: null }, ''));
    check('cups are not European', !isEuropean('cups'));
    check('Bund is', isEuropean('bunch'));
    equal('"7 Stück = 1 Bund" stored against the bunch', storedFactor('', 7, 'bunch', 1), { measure: 'count:', factor: 0.142857 });
    equal('and written back', conversionText('', 'bunch', 1 / 7, 'de').text, '7 Stück = 1 Bund');
    equal('rebased onto another main unit', rebased({ buy: 'count:bund', factors: { 'count:': 0.2 } }, 'count:'), { buy: 'count:', factors: { 'count:bund': 5 } });
    equal('EL beside ml is no conflict', unitState({ unit: null, moreUnits: [] }, [{ unit: 'tbsp', count: 1 }, { unit: 'ml', count: 1 }]).odd, []);
    equal('allowed, not chosen: the other one is the standard', unitState({ unit: null, moreUnits: ['count:'] }, [{ unit: 'g', count: 3 }, { unit: '', count: 1 }]).unit, 'g');

    equal('the shopping list buys in the card\'s main unit', unitsOf({ buyMeasure: 'mass', factors: { 'count:': 100 }, unit: '' }, null), { buy: 'count:', factors: { mass: 0.01 } });

    suite('ingredient units: what waits for the AI');
    equal('g and kg need nobody', missingConversions(['mass', 'mass'], null, 'g'), []);
    equal('EL and ml need nobody', missingConversions(['spoon', 'volume'], null, 'ml'), []);
    equal('pieces and grams wait', missingConversions(['mass', 'count:'], null, 'g'), ['count:']);
    equal('known factors need nobody', missingConversions(['count:bund', 'count:'], springOnion, 'bunch'), []);

    suite('translation: the list names the ingredients');
    const translated = withGlossary(
        { ingredients: [{ amount: '2', item: 'scallions, finely sliced' }, { amount: '1 TL', item: 'salt' }] },
        { ingredients: [{ amount: '2', item: 'Frühlingszwiebeln, fein geschnitten' }, { amount: '1 TL', item: 'Salz' }] },
        { Frühlingszwiebeln: 'spring onions' }
    );
    equal("the list's name, the model's preparation", translated.ingredients[0].item, 'Spring onions, finely sliced');
    equal('what the list does not know stays the model\'s', translated.ingredients[1].item, 'salt');

    suite('ingredient match: the other language follows');
    const english = [{ amount: '', item: '## Sauce' }, { amount: '2', item: 'scallions, chopped' }, { amount: '1 tsp', item: 'salt' }];
    const german = [{ amount: '', item: '## Soße' }, { amount: '2', item: 'Lauchzwiebeln, gehackt' }, { amount: '1 TL', item: 'Salz' }];
    equal("the row beside gets the list's name, its own preparation kept", syncedRows(english, german, 1, 'spring onions')[1].item, 'Spring onions, chopped');
    equal('a heading is never renamed', syncedRows(english, german, 0, 'x')[0].item, '## Sauce');
    equal('lists that do not line up: nothing renamed', syncedRows(english, [...german, { amount: '', item: 'Pfeffer' }], 1, 'spring onions'), english);

    suite('ingredient match: the translation follows the rows');
    const [mehl, eier] = [{ amount: '200 g', item: 'Mehl' }, { amount: '2', item: 'Eier' }];
    const other = [{ amount: '200 g', item: 'Flour' }, { amount: '2', item: 'Eggs' }];
    equal('a row moved is moved there too', followedRows([mehl, eier], [eier, mehl], other, 'en')?.map((row) => `${row.amount} ${row.item}`), ['2 Eggs', '200 g Flour']);
    equal('a row added is an empty row there', followedRows([mehl, eier], [mehl, { amount: '', item: '' }, eier], other, 'en')?.map((row) => row.item), ['Flour', '', 'Eggs']);
    equal('a row removed is removed there', followedRows([mehl, eier], [eier], other, 'en')?.map((row) => row.item), ['Eggs']);
    equal('an amount edited reaches its own row', followedRows([mehl, eier], [{ ...mehl, amount: '250 g' }, eier], other, 'en')?.map((row) => row.amount), ['250 g', '2']);
    equal('a list that does not line up is left alone', followedRows([mehl, eier], [eier, mehl], other.slice(0, 1), 'en'), null);

    suite('translation: the same amounts in both languages');
    const original = [{ amount: '480 ml', item: 'water' }, { amount: '2 tbsp', item: 'sugar' }, { amount: '1 can', item: 'tomatoes' }];
    const deRows = [{ amount: '505 ml', item: 'Wasser' }, { amount: '2 EL', item: 'Zucker' }, { amount: '1 Dose', item: 'Tomaten' }];
    equal("the original's numbers, the German unit words", mirroredRows(deRows, original, 'de').map((row) => row.amount), ['480 ml', '2 EL', '1 Dose']);

    suite('ingredient match: names cut at a comma');
    equal('a capitalised first participle is not the name', coreName('Fermentierte, gesalzene Garnelen mit der salzigen Lauge'), 'Fermentierte, gesalzene Garnelen mit der salzigen Lauge');
    equal('"Tomate, gehackt" is still Tomate', coreName('Tomate, gehackt'), 'Tomate');
    check('"Fermentierte" for "fermented salted shrimp" is broken', brokenGermanName({ de: 'Fermentierte', en: 'fermented salted shrimp' }));
    check('"Tomate" is not', !brokenGermanName({ de: 'Tomate', en: 'tomatoes' }));
    check('"Gehacktes" is a name of its own', !brokenGermanName({ de: 'Gehacktes', en: 'Minced meat' }));
    check('"Gehackte Tomaten" is not', !brokenGermanName({ de: 'Gehackte Tomaten', en: 'chopped tomatoes' }));

    suite('ingredient match: the form finds names');
    const catalog = [item(1, 'Pasta', 'pasta', ['Nudeln']), item(2, 'Frühlingszwiebeln', 'spring onions'), item(3, 'Tomaten', 'tomatoes')];
    equal('a known name', matchIn('Pasta', catalog)?.id, 1);
    equal('by a further name', matchIn('Nudeln, gekocht', catalog)?.id, 1);
    equal('new: no match', matchIn('Vollkornpasta', catalog), null);
    check('new, but alike: a word more', similarIn('Vollkornpasta', catalog).some((entry) => entry.id === 1));
    check('new, but alike: a typo', similarIn('Frühlingzwiebeln', catalog).some((entry) => entry.id === 2));
    equal('nothing alike', similarIn('Safran', catalog), []);
    const powders = [item(10, 'Chilipulver', 'chili powder'), item(11, 'Backpulver', 'baking powder'), item(12, 'Kurkuma', 'turmeric')];
    equal('a shared "powder" is no likeness', similarIn('turmeric powder', powders).map((entry) => entry.id), [12]);
}
