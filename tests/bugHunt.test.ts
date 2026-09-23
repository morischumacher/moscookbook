/** Things a review found wrong, each pinned so it stays fixed */
import { suite, equal } from './harness';
import { splitSteps } from '../src/lib/steps';
import { timersIn } from '../src/lib/cookSteps';
import { parseQuantity } from '../src/lib/amount';
import { splitAmount } from '../src/lib/ingredientParts';
import { aisleOf, shoppingKey, lineFromText, amountLabel } from '../src/lib/shopping';
import { formatQuantity } from '../src/lib/amount';
import { toBase, fromBase } from '../src/lib/units';

export default function bugHuntTests() {
    suite('bug hunt: steps');
    equal('a paragraph, then a numbered list', splitSteps('Ofen vorheizen.\n\n1. Mischen\n2. Backen 20 Minuten\n3. Servieren'), ['Ofen vorheizen.', 'Mischen', 'Backen 20 Minuten', 'Servieren']);
    equal('a heading goes in front of its first step', splitSteps('## Teig\n1. Mehl\n2. Kneten'), ['Teig: Mehl', 'Kneten']);
    equal('blank-line steps still work', splitSteps('1. Eins\n\n2. Zwei'), ['Eins', 'Zwei']);

    suite('bug hunt: timers');
    equal('half an hour written as a fraction', timersIn('1/2 Stunde köcheln')[0]?.seconds, 1800);
    equal('one and a half hours', timersIn('1 1/2 Stunden backen')[0]?.seconds, 5400);
    equal('a range with an em dash starts early', timersIn('10—12 Minuten')[0]?.seconds, 600);
    equal('"h" is hours', timersIn('1 h gehen lassen')[0]?.seconds, 3600);

    suite('bug hunt: quantities');
    equal('1.000 g is a thousand', parseQuantity('1.000'), 1000);
    equal('1,000 too', parseQuantity('1,000'), 1000);
    equal('1,5 is still one and a half', parseQuantity('1,5'), 1.5);
    equal('1.25 is still a decimal', parseQuantity('1.25'), 1.25);

    suite('bug hunt: round 4');
    equal('1½ is one and a half', splitAmount('1½ cups').quantity, 1.5);
    equal('a timer for 1½ hours', timersIn('1½ Stunden köcheln')[0]?.seconds, 5400);
    equal('Champignons are not ham', aisleOf('Champignons'), 'produce');
    equal('an eggplant is not an egg', aisleOf('eggplant'), 'produce');
    equal('Zitrone and Zitronen are one line', shoppingKey('Zitronen'), shoppingKey('Zitrone'));
    equal('Zehe and Zehen are one unit', toBase({ quantity: 1, quantityMax: null, unit: 'Zehe' }, 'Knoblauch')?.key, toBase({ quantity: 2, quantityMax: null, unit: 'Zehen' }, 'Knoblauch')?.key);
    equal('and three are written as Zehen', fromBase({ key: 'count:zehe', amount: 3 }).unit, 'Zehen');
    equal('a cup of buttermilk is not butter', toBase({ quantity: 1, quantityMax: null, unit: 'cup' }, 'Buttermilch')?.key, 'volume');
    equal('nor rice vinegar rice', toBase({ quantity: 1, quantityMax: null, unit: 'cup' }, 'Reisessig')?.key, 'volume');

    suite('bug hunt: round 5');
    equal('"große" is part of the name, not a unit', lineFromText('3 große Zwiebeln')?.name, 'große Zwiebeln');
    equal('½ Zitrone is half a lemon', lineFromText('½ Zitrone')?.amount, 0.5);
    equal('2-3 Äpfel has an amount', lineFromText('2-3 Äpfel')?.name, 'Äpfel');
    equal('Zehen stay a unit', amountLabel(lineFromText('2 Zehen Knoblauch')!.measure, lineFromText('2 Zehen Knoblauch')!.amount, 'de'), '2 Zehen');
    equal('a decimal comma in German', formatQuantity(1.4, 'de'), '1,4');
    equal('a decimal point in English', formatQuantity(1.4, 'en'), '1.4');
}
