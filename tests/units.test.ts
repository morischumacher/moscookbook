/** Units: metric by default, tidy after scaling, addable for the shopping list */
import { suite, check, equal } from './harness';
import { countUnitLabel, fromBase, hasMeasures, hasNonMetric, tidy, toBase, toMetric, toUS, unitOf } from '../src/lib/units';

const amount = (quantity: number | null, unit: string | null, quantityMax: number | null = null) => ({
    quantity,
    quantityMax,
    unit,
});

export default function unitsTests() {
    suite('units: recognised as written');
    for (const written of ['EL', 'el', 'Esslöffel', 'tbsp', 'Tbsp.']) equal(`${written} is a tablespoon`, unitOf(written)?.id, 'tbsp');
    for (const written of ['TL', 'Teelöffel', 'tsp']) equal(`${written} is a teaspoon`, unitOf(written)?.id, 'tsp');
    equal('cups', unitOf('cups')?.id, 'cup');
    equal('Gramm', unitOf('Gramm')?.id, 'g');
    check('a clove is not a unit we convert', unitOf('Zehen') === null);

    suite('units: into European measures');
    equal('a cup of flour is weighed', toMetric(amount(1, 'cup'), 'all-purpose flour'), amount(125, 'g'));
    equal('two cups of sugar', toMetric(amount(2, 'cups'), 'sugar'), amount(400, 'g'));
    equal('a cup of milk is measured', toMetric(amount(1, 'cup'), 'milk'), amount(240, 'ml'));
    equal('a pound of beef', toMetric(amount(1, 'lb'), 'ground beef'), amount(455, 'g'));
    equal('eight ounces of cheese', toMetric(amount(8, 'oz'), 'cheddar'), amount(225, 'g'));
    equal('a range stays a range', toMetric(amount(1, 'cup', 2), 'water'), amount(240, 'ml', 480));
    equal('spoons stay spoons', toMetric(amount(2, 'tbsp'), 'olive oil', 'de'), amount(2, 'EL'));
    equal('and read in German', toMetric(amount(1, 'tsp'), 'salt', 'de'), amount(1, 'TL'));
    equal('a named unit is left alone', toMetric(amount(2, 'Zehen'), 'Knoblauch'), amount(2, 'Zehen'));
    equal('no amount, nothing to do', toMetric(amount(null, 'etwas'), 'Salz'), amount(null, 'etwas'));
    check('a German recipe needs no switch', !hasNonMetric([amount(200, 'g'), amount(2, 'EL')]));
    check('an American one does', hasNonMetric([amount(1, 'cup')]));

    suite('units: into American measures (work #29, #44)');
    equal('125 g flour is a cup', toUS(amount(125, 'g'), 'flour', 'en'), amount(1, 'cup'));
    equal('400 g sugar is two cups', toUS(amount(400, 'g'), 'Zucker', 'de'), amount(2, 'Tassen'));
    equal('480 ml milk is two cups', toUS(amount(480, 'ml'), 'milk', 'en'), amount(2, 'cups'));
    equal('80 ml is a third of a cup', toUS(amount(80, 'ml'), 'water', 'en'), amount(0.333, 'cup'));
    equal('30 ml is two tablespoons', toUS(amount(30, 'ml'), 'soy sauce', 'en'), amount(2, 'tbsp'));
    equal('5 ml is a teaspoon', toUS(amount(5, 'ml'), 'vinegar', 'de'), amount(1, 'TL'));
    equal('200 g grated cheese is two cups', toUS(amount(200, 'g'), 'grated cheese', 'en'), amount(2, 'cups'));
    equal('225 g beef is eight ounces', toUS(amount(225, 'g'), 'beef', 'en'), amount(8, 'oz'));
    equal('a kilo of potatoes is pounds', toUS(amount(1, 'kg'), 'potatoes', 'en'), amount(2.25, 'lb'));
    equal('cups stay cups', toUS(amount(1, 'cup'), 'flour', 'en'), amount(1, 'cup'));
    equal('spoons stay spoons', toUS(amount(2, 'EL'), 'oil', 'de'), amount(2, 'EL'));
    equal('a range stays a range', toUS(amount(240, 'ml', 480), 'water', 'en'), amount(1, 'cups', 2));
    check('a German recipe has something to switch', hasMeasures([amount(200, 'g'), amount(2, 'EL')]));
    check('spoons alone do not', !hasMeasures([amount(2, 'EL'), amount(2, 'Zehen')]));

    suite('units: tidy after scaling');
    equal('1000 g is a kilo', tidy(amount(1000, 'g')), amount(1, 'kg'));
    equal('1500 ml is a litre and a half', tidy(amount(1500, 'ml')), amount(1.5, 'l'));
    equal('a quarter kilo is 250 g', tidy(amount(0.25, 'kg')), amount(250, 'g'));
    equal('six teaspoons are two tablespoons', tidy(amount(6, 'TL')), amount(2, 'EL'));
    equal('four are not', tidy(amount(4, 'TL')), amount(4, 'TL'));
    equal('433 g is said as 435 g', tidy(amount(433, 'g')), amount(435, 'g'));

    suite('units: adding up for the shopping list');
    const flour = [toBase(amount(200, 'g'), 'Mehl')!, toBase(amount(0.5, 'kg'), 'Mehl')!];
    equal('grams and kilos add up', fromBase({ key: 'mass', amount: flour[0].amount + flour[1].amount }), amount(700, 'g'));
    equal('a cup of flour joins them', toBase(amount(1, 'cup'), 'flour'), { key: 'mass', amount: 125 });
    equal('spoons add up as spoons', fromBase({ key: 'spoon', amount: toBase(amount(3, 'TL'), 'Salz')!.amount + toBase(amount(1, 'EL'), 'Salz')!.amount }), amount(2, 'EL'));
    equal('butter by the spoon is bought by weight', toBase(amount(3, 'EL'), 'Butter'), { key: 'mass', amount: 42 });
    equal('cloves add up as cloves, keyed by the singular', toBase(amount(2, 'Zehen'), 'Knoblauch'), { key: 'count:zehe', amount: 2 });
    equal('a plain count too', toBase(amount(3, null), 'Eier'), { key: 'count:', amount: 3 });
    equal('a range buys the top of it', toBase(amount(2, null, 3), 'Eier'), { key: 'count:', amount: 3 });

    suite('units: rounding and named units');
    equal('999 g is a kilo, not "1.000 g"', tidy({ quantity: 999, quantityMax: null, unit: 'g' }, 'de'), { quantity: 1, quantityMax: null, unit: 'kg' });
    equal('998 ml is a litre too', tidy({ quantity: 998, quantityMax: null, unit: 'ml' }, 'de').unit, 'l');
    equal('three cloves are Zehen', countUnitLabel('Zehe', 3), 'Zehen');
    equal('one can is a Dose', countUnitLabel('Dosen', 1), 'Dose');
    equal('a word that is no unit is left alone', countUnitLabel('große', 3), 'große');
    equal('English stays lower case', countUnitLabel('clove', 2), 'cloves');
    equal('2 EL and 1 TL on the list', fromBase({ key: 'spoon', amount: 35 }, 'de'), { quantity: 7 / 3, quantityMax: null, unit: 'EL' });
    equal('3 EL stay 3 EL', fromBase({ key: 'spoon', amount: 45 }, 'de').quantity, 3);
    equal('1234 g reach the list as 1234 g', toBase({ quantity: 1234, quantityMax: null, unit: 'g' }, 'Mehl'), { key: 'mass', amount: 1234 });
}
