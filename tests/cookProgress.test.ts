import { suite, check, equal } from './harness';
import {
    parseCookProgress,
    worthSaving,
    isFresh,
    cookProgressKey,
    COOK_PROGRESS_TTL_MS,
} from '../src/lib/cookProgress';

/**
 * What a half-cooked recipe remembers.
 *
 * Worth testing because everything here reads something a *previous* version
 * of this application wrote. A shape that has changed since must read as
 * "nothing saved" — the alternative is a recipe page that throws on open, in
 * the one place somebody is standing over a pan.
 */
export default function cookProgressTests() {
    suite('cooking progress');

    const now = 1_700_000_000_000;
    const fresh = JSON.stringify({ ingredients: [0, 2], steps: [1], servings: 6, at: now - 1000 });

    /* --------------------------------------------------------- the good case */

    equal('what was ticked comes back', parseCookProgress(fresh, now), {
        ingredients: [0, 2],
        steps: [1],
        servings: 6,
        at: now - 1000,
    });

    equal('the key is per recipe', cookProgressKey(12), 'moscookbook:cooking:12');

    /* ------------------------------------------------------------- expiry */

    check(
        'something from this morning is still good',
        isFresh({ at: now - 6 * 60 * 60 * 1000 }, now)
    );

    check(
        'something from two days ago is not',
        !isFresh({ at: now - 48 * 60 * 60 * 1000 }, now),
        'a recipe should not open on Wednesday with Sunday\'s steps crossed off'
    );

    check(
        'a record from the future is refused',
        !isFresh({ at: now + 60_000 }, now),
        'a clock that was wrong, or a record from another device'
    );

    equal(
        'and an expired record reads as nothing',
        parseCookProgress(
            JSON.stringify({ ingredients: [1], steps: [], servings: null, at: now - COOK_PROGRESS_TTL_MS - 1 }),
            now
        ),
        null
    );

    /* ------------------------------------------------------ rubbish in storage */

    equal('nothing stored', parseCookProgress(null, now), null);
    equal('empty string', parseCookProgress('', now), null);
    equal('not JSON', parseCookProgress('{oh no', now), null);
    equal('JSON, but not an object', parseCookProgress('42', now), null);
    equal('null', parseCookProgress('null', now), null);
    equal('no timestamp', parseCookProgress('{"ingredients":[1]}', now), null);

    equal(
        'an older shape, with the arrays missing',
        parseCookProgress(JSON.stringify({ at: now }), now),
        { ingredients: [], steps: [], servings: null, at: now }
    );

    equal(
        'arrays holding things that are not indexes',
        parseCookProgress(
            JSON.stringify({ ingredients: [0, 'two', null, 3.5, 4], steps: [], at: now }),
            now
        ),
        { ingredients: [0, 4], steps: [], servings: null, at: now }
    );

    equal(
        'a servings count of zero is not a servings count',
        parseCookProgress(JSON.stringify({ ingredients: [], steps: [], servings: 0, at: now }), now)
            ?.servings ?? null,
        null
    );

    /* ------------------------------------------------------- worth writing down */

    check('a ticked ingredient is', worthSaving({ ingredients: [1], steps: [], servings: 4 }, 4));
    check('a ticked step is', worthSaving({ ingredients: [], steps: [0], servings: 4 }, 4));

    check(
        'changed servings are',
        worthSaving({ ingredients: [], steps: [], servings: 8 }, 4),
        'somebody doubled the recipe and that is a decision'
    );

    check(
        'merely opening a recipe is not',
        !worthSaving({ ingredients: [], steps: [], servings: 4 }, 4),
        'every recipe anybody looks at would otherwise leave a record'
    );

    check(
        'and neither is one with no servings at all',
        !worthSaving({ ingredients: [], steps: [], servings: null }, null)
    );
}
