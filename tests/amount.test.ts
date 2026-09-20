/** amount scaling + step splitting */
import { scaleAmount, parseQuantity, formatQuantity, isoDurationToMinutes, parseServings, formatMinutes } from '../src/lib/amount';
import { splitSteps } from '../src/lib/steps';
import { suite, check } from './harness';

export default function run() {

    suite('scaleAmount — doubling');
    const doubles: [string, string][] = [
        ['200 g', '400 g'], ['200g', '400g'], ['1,5 kg', '3 kg'], ['1/2 TL', '1 TL'],
        ['2-3 EL', '4-6 EL'], ['1 1/2 Tassen', '3 Tassen'], ['3', '6'],
        ['1 Prise', '2 Prise'], ['2 bis 3 EL', '4 bis 6 EL'],
    ];
    for (const [input, want] of doubles) {
        const got = scaleAmount(input, 2);
        check(`"${input}" x2 -> "${want}"`, got === want, got);
    }

    suite('scaleAmount — halving');
    const halves: [string, string][] = [
        ['200 g', '100 g'], ['1 TL', '1/2 TL'], ['3 Eier', '1 1/2 Eier'],
        ['1/2 TL', '1/4 TL'], ['2-4 EL', '1-2 EL'],
    ];
    for (const [input, want] of halves) {
        const got = scaleAmount(input, 0.5);
        check(`"${input}" x0.5 -> "${want}"`, got === want, got);
    }

    suite('scaleAmount — must never guess');
    for (const untouched of ['etwas', 'nach Geschmack', '', 'eine Handvoll', 'Salz']) {
        check(`leaves "${untouched}" alone`, scaleAmount(untouched, 3) === untouched, scaleAmount(untouched, 3));
    }
    check('factor 1 is identity', scaleAmount('200 g', 1) === '200 g');
    check('factor 0 is identity', scaleAmount('200 g', 0) === '200 g');
    check('negative factor is identity', scaleAmount('200 g', -2) === '200 g');
    check('NaN factor is identity', scaleAmount('200 g', Number.NaN) === '200 g');

    suite('round trip: scaling up then down returns the original');
    for (const amount of ['200 g', '1/2 TL', '4 EL', '2 Zehen']) {
        const there = scaleAmount(amount, 4);
        const back = scaleAmount(there, 0.25);
        check(`"${amount}" x4 x0.25 -> "${amount}"`, back === amount, { there, back });
    }

    suite('parseQuantity / formatQuantity');
    check('mixed fraction', parseQuantity('1 1/2') === 1.5, parseQuantity('1 1/2'));
    check('fraction', parseQuantity('3/4') === 0.75);
    check('comma decimal', parseQuantity('1,5') === 1.5);
    check('division by zero', parseQuantity('1/0') === null);
    check('garbage', parseQuantity('abc') === null);
    check('formats third', formatQuantity(1 / 3) === '1/3', formatQuantity(1 / 3));
    check('formats 2.5', formatQuantity(2.5) === '2 1/2', formatQuantity(2.5));
    check('rounds big values', formatQuantity(333.33) === '333', formatQuantity(333.33));
    check('keeps integers', formatQuantity(6) === '6');

    suite('schema.org helpers');
    check('PT1H30M', isoDurationToMinutes('PT1H30M') === 90, isoDurationToMinutes('PT1H30M'));
    check('PT45M', isoDurationToMinutes('PT45M') === 45);
    check('PT0M is null', isoDurationToMinutes('PT0M') === null);
    check('garbage is null', isoDurationToMinutes('soon') === null);
    check('servings from text', parseServings('4 Portionen') === 4);
    check('servings from number', parseServings(6) === 6);
    check('servings from array', parseServings(['4 servings']) === 4);
    check('absurd servings rejected', parseServings('500') === null);
    check('formatMinutes 90', formatMinutes(90) === '1 Std. 30 Min.', formatMinutes(90));
    check('formatMinutes 60', formatMinutes(60) === '1 Std.');
    check('formatMinutes null', formatMinutes(null) === '');

    suite('splitSteps');
    check('blank-line separated', splitSteps('1. Eins\n\n2. Zwei\n\n3. Drei').length === 3, splitSteps('1. Eins\n\n2. Zwei\n\n3. Drei'));
    check('numbers stripped', splitSteps('1. Eins\n\n2. Zwei')[0] === 'Eins', splitSteps('1. Eins\n\n2. Zwei'));
    check('tight list', splitSteps('1. Eins\n2. Zwei\n3. Drei').length === 3, splitSteps('1. Eins\n2. Zwei\n3. Drei'));
    check('single paragraph stays one', splitSteps('Alles in eine Pfanne und braten.').length === 1);
    check('empty', splitSteps('').length === 0);
    check('bullets', splitSteps('- Eins\n- Zwei').length === 2, splitSteps('- Eins\n- Zwei'));


}
