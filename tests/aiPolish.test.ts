import { suite, check, equal } from './harness';
import { keepsNumbers, numbersIn, polish } from '../src/lib/aiPolish';
import type { AiKey } from '../src/lib/aiImport';

/**
 * The guard on the two "revise my text" buttons.
 *
 * The check that matters is the number check, and it matters because of how
 * the failure looks: a method tidied from "18–20 Minuten backen" into "20
 * Minuten backen" reads perfectly, is wrong, and nobody proof-reading their
 * own recipe catches it — they already know what it says. A machine comparing
 * two multisets of numbers catches it every time and costs nothing.
 */
const key: AiKey = { provider: 'anthropic', apiKey: 'sk-ant-TEST-0000', model: null };

export default async function aiPolishTests() {
    suite('aiPolish: numbers');

    equal('numbers are found', numbersIn('200 g Mehl, 3 Eier'), ['200', '3']);
    equal('a decimal comma is a decimal point', numbersIn('1,5 l'), ['1.5']);
    equal('and a trailing zero does not matter', numbersIn('2.0 EL'), ['2']);

    check('the same numbers pass', keepsNumbers('180 Grad, 25 Minuten', 'Bei 180 Grad 25 Minuten backen.'));
    check('reordered numbers still pass', keepsNumbers('3 Eier, 200 g', '200 g Mehl und 3 Eier'));
    check('a comma rewritten as a point passes', keepsNumbers('1,5 l Brühe', '1.5 l Brühe'));

    check('a dropped number fails', !keepsNumbers('18–20 Minuten', '20 Minuten'));
    check('a changed number fails', !keepsNumbers('180 Grad', '200 Grad'));
    check('an invented number fails', !keepsNumbers('Backen bis goldbraun', 'Backen, etwa 20 Minuten'));

    suite('aiPolish: what gets refused');

    const ORIGINAL = 'Die Zwiebel würfeln und bei 180 Grad 25 Minuten im Ofen garen. Danach servieren.';

    const answering = (answer: string) => async () => answer;

    equal(
        'no key is refused before anything is called',
        (await polish('spelling', ORIGINAL, [], answering('x'))).ok,
        false
    );

    const good = await polish('spelling', ORIGINAL, [key], answering(
        'Die Zwiebel würfeln und bei 180 Grad 25 Minuten im Ofen garen. Danach servieren.'
    ));
    check('an unchanged answer comes back as unchanged', good.ok && good.unchanged, good);

    const fixed = await polish('spelling', 'Die Zwibel würfeln, 180 Grad.', [key], answering(
        'Die Zwiebel würfeln, 180 Grad.'
    ));
    check('a corrected answer comes back', fixed.ok && !fixed.unchanged, fixed);
    equal('with the correction in it', fixed.ok ? fixed.text : '', 'Die Zwiebel würfeln, 180 Grad.');

    const rounded = await polish('steps', ORIGINAL, [key], answering(
        '1. Die Zwiebel würfeln.\n\n2. Bei 200 Grad 25 Minuten garen.'
    ));
    equal('a changed temperature is refused', rounded.ok, false);
    equal(
        'and says so specifically',
        rounded.ok ? '' : rounded.reason,
        'numbers-changed'
    );

    const essay = await polish('spelling', ORIGINAL, [key], answering(
        'Certainly! Here is a detailed explanation of the corrections I made. '.repeat(40)
    ));
    equal('a model that explains itself instead is refused', essay.ok, false);

    const empty = await polish('spelling', ORIGINAL, [key], answering('   '));
    equal('an empty answer is refused', empty.ok, false);

    // Two keys: the first fails, the second answers.
    let asked = 0;
    const second: AiKey = { provider: 'openai', apiKey: 'sk-TEST-1111', model: null };
    const chain = await polish('spelling', ORIGINAL, [key, second], async (which) => {
        asked++;
        if (which.provider === 'anthropic') throw new Error('rate limited');
        return ORIGINAL;
    });

    check('the second provider is asked when the first fails', chain.ok, chain);
    equal('and both were tried', asked, 2);
}
