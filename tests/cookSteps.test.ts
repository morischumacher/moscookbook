/** Cook mode: timers and ingredients read out of a step */
import { suite, equal } from './harness';
import { clock, ingredientsInStep, timersIn } from '../src/lib/cookSteps';
import { withCelsius } from '../src/lib/units';

export default function cookStepsTests() {
    suite('cook mode: timers in a step');
    equal('German minutes', timersIn('Die Zwiebeln 15 Minuten goldbraun rösten.'), [{ label: '15 Minuten', seconds: 900 }]);
    equal('abbreviated', timersIn('10 Min. köcheln')[0]?.seconds, 600);
    equal('a range starts at its short end', timersIn('20-25 Minuten backen'), [{ label: '20-25 Minuten', seconds: 1200 }]);
    equal('hours', timersIn('Simmer for 2 hours.')[0]?.seconds, 7200);
    equal('English minutes', timersIn('let the batter rest for 5 minutes.'), [{ label: '5 minutes', seconds: 300 }]);
    equal('a minute', timersIn('Stir for a minute')[0]?.seconds, 60);
    equal('an hour in words', timersIn('Eine Stunde gehen lassen')[0]?.seconds, 3600);
    equal('half an hour', timersIn('Rest for half an hour')[0]?.seconds, 1800);
    equal('two timers in one step', timersIn('5 min anbraten, dann 30 Minuten schmoren').length, 2);
    equal('decimals', timersIn('1,5 Stunden')[0]?.seconds, 5400);
    equal('no timer in "200 g"', timersIn('200 g Mehl unterrühren'), []);
    equal('nor in "Minzblätter"', timersIn('3 Minzblätter'), []);
    equal('an overnight rest is not a kitchen timer', timersIn('24 Stunden ziehen lassen'), []);

    equal('the clock', clock(90), '1:30');
    equal('with hours', clock(3900), '1:05:00');

    suite('cook mode: the ingredients a step uses');
    const names = ['Zwiebeln, fein gehackt', 'Butter', '400 g Spätzle', 'Bergkäse', 'Salz'];
    equal('by main word, plural or not', ingredientsInStep('Die Zwiebel in der Butter andünsten.', names), [0, 1]);
    equal('umlauts either way', ingredientsInStep('Spaetzle abgießen und mit Bergkäse schichten', names), [2, 3]);
    equal('as the start of a longer word', ingredientsInStep('Zwiebelringe dazugeben', names), [0]);
    equal('not in the middle of one', ingredientsInStep('Kräuterbutter servieren', ['Butter']), []);

    suite('units: oven temperatures');
    equal('Fahrenheit gets Celsius', withCelsius('Bake at 350°F until golden.'), 'Bake at 350 °F (175 °C) until golden.');
    equal('once only', withCelsius('350 °F (175 °C)'), '350 °F (175 °C)');
}
