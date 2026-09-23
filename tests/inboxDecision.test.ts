/** Inbox: what a row that did not come in complete asks of you */
import { suite, equal } from './harness';
import { decisionFor } from '../src/lib/inboxDecision';
import { reason } from '../src/lib/captureReasons';

export default function inboxDecisionTests() {
    const row = (status: string, error: string | null, sourceUrl: string | null = 'https://x.example/r') => ({ status, error, sourceUrl });

    suite('inbox: the decision a row needs');
    equal('a complete row needs none of this', decisionFor(row('ready', null), true), null);
    equal('no recipe: delete it', decisionFor(row('needsWork', reason('noRecipe')), true)?.steps[0], 'discard');
    equal('in the bio: open the source', decisionFor(row('needsWork', reason('recipeInBio')), true)?.steps[0], 'openSource');
    equal('spoken, AI on: let the AI read the subtitles', decisionFor(row('needsWork', reason('videoSpokenNeedsAi')), true)?.steps[0], 'askAi');
    const spokenOff = decisionFor(row('needsWork', reason('videoSpokenNeedsAi')), false);
    equal('spoken, AI off: watch it', spokenOff?.steps[0], 'openSource');
    equal('and say the AI would have helped', spokenOff?.aiWouldHelp, true);
    equal('half a recipe: finish it by hand', decisionFor(row('needsWork', reason('pagePartial')), true)?.steps[0], 'edit');
    equal('unreadable: read again first', decisionFor(row('failed', reason('pageUnreadable', 'timeout')), true)?.steps[0], 'retry');
    equal('no link: nothing to open or reread', decisionFor(row('failed', reason('pictureFailed'), null), false)?.steps, ['discard']);
    equal('an old row with a sentence still gets steps', decisionFor(row('needsWork', 'The page held only part of a recipe.'), true)?.steps, ['edit', 'askAi', 'discard']);
}
