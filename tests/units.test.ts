/** Units: metric by default, tidy after scaling, addable for the shopping list */
import { suite, check, equal } from './harness';
import { fromBase, hasNonMetric, tidy, toBase, toMetric, unitOf } from '../src/lib/units';

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
}
