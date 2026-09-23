/** Things a review found wrong, each pinned so it stays fixed */
import { suite, equal } from './harness';
import { splitSteps } from '../src/lib/steps';
import { timersIn } from '../src/lib/cookSteps';
import { parseQuantity } from '../src/lib/amount';

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
}
