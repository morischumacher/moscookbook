/** German texts in one voice: "Gib …", not "Geben Sie …" (the owner's wish) */
import { suite, check } from './harness';
import { needsVoice, sameContent } from '../src/lib/recipeVoiceDb';

export default function recipeVoiceTests() {
    suite('voice: what is rewritten');
    check('"Geben Sie" is', needsVoice('1. Geben Sie die Zwiebeln in die Pfanne.'));
    check('"Sie" in the middle of a sentence is', needsVoice('Dann können Sie alles servieren.'));
    check('infinitive steps are', needsVoice('1. Zwiebeln schälen.\n\n2. In Würfel schneiden.\n\n3. Kurz anbraten.'));
    check('the du voice is not', !needsVoice('1. Schäle die Zwiebeln.\n\n2. Schneide sie in Würfel.\n\n3. Brate sie kurz an.'));
    check('nor "sie" for the onions', !needsVoice('Brate die Zwiebeln, bis sie weich sind.'));
    check('nor nothing', !needsVoice(''));

    suite('voice: a rewrite is only taken when nothing else changed');
    check('the same numbers and steps', sameContent('1. Geben Sie 200 g Mehl dazu.\n\n2. 10 Minuten backen.', '1. Gib 200 g Mehl dazu.\n\n2. Backe alles 10 Minuten.'));
    check('a changed number is refused', !sameContent('1. 10 Minuten backen.', '1. Backe 12 Minuten.'));
    check('a dropped step is refused', !sameContent('1. Schälen.\n\n2. Schneiden.', '1. Schäle und schneide alles.'));
}
