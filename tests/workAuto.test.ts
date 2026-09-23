/** Which failures go onto the work list by themselves */
import { suite, equal } from './harness';
import { captureIsObvious, errorIsObvious } from '../src/lib/workAuto';
import { reason } from '../src/lib/captureReasons';

export default function workAutoTests() {
    suite('work list: obvious inbox failures');
    equal('a page that could not be read', captureIsObvious('failed', reason('pageUnreadable', 'http-error')), true);
    equal('half a recipe from a page', captureIsObvious('needsWork', reason('pagePartial')), true);
    equal('half a recipe from a video description', captureIsObvious('needsWork', reason('videoPartial')), true);
    equal('not a post whose recipe is in the bio', captureIsObvious('needsWork', reason('recipeInBio')), false);
    equal('not an advertisement for a recipe', captureIsObvious('needsWork', reason('noRecipe')), false);
    equal('not a recipe only spoken', captureIsObvious('needsWork', reason('videoSpoken')), false);
    equal('not a screenshot waiting for the AI', captureIsObvious('needsWork', reason('pictureNeedsAi')), false);
    equal('not a stray note', captureIsObvious('needsWork', reason('textPartial')), false);
    equal('not a private address, refused on purpose', captureIsObvious('failed', reason('pageUnreadable', 'unsafe-url')), false);
    equal('not something that read fine', captureIsObvious('ready', null), false);
    equal('not an old row with a sentence', captureIsObvious('failed', 'The page could not be read (timeout).'), false);

    suite('task list: every trusted error is a task');
    equal('a trusted error at once (server, or reported by somebody signed in)', errorIsObvious(true), true);
    equal('not an anonymous report: anybody can post one', errorIsObvious(false), false);
}
