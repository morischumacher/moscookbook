import { suite, equal, check } from './harness';
import {
    normaliseMessage,
    significantFrame,
    fingerprint,
    safePath,
    prepareErrorReport,
} from '../src/lib/errorReport';

export default function errorReportTests() {
    suite('normaliseMessage');

    // Without this, every id starts its own group and the list becomes a log.
    equal('replaces numbers', normaliseMessage('Recipe 7 not found'), 'Recipe <n> not found');
    equal(
        'so two of the same problem collapse into one',
        normaliseMessage('Recipe 7 not found'),
        normaliseMessage('Recipe 1284 not found')
    );
    equal(
        'replaces uuids',
        normaliseMessage('Blob 3f2504e0-4f89-11d3-9a0c-0305e82c3301 missing'),
        'Blob <uuid> missing'
    );
    equal('replaces long hashes', normaliseMessage('token a1b2c3d4e5f60718 bad'), 'token <hash> bad');
    equal(
        'replaces timestamps',
        normaliseMessage('expired at 2026-09-21T10:00:00.000Z'),
        'expired at <time>'
    );
    equal(
        'replaces quoted values',
        normaliseMessage('Unknown column "searchVector"'),
        'Unknown column <value>'
    );
    equal('collapses whitespace', normaliseMessage('a\n\n  b'), 'a b');

    suite('significantFrame');

    const stack = [
        'TypeError: x is not a function',
        '    at Object.get (/var/task/node_modules/next/dist/server/thing.js:12:9)',
        '    at eval (webpack-internal:///./src/lib/x.ts:4:1)',
        '    at loadRecipe (/var/task/src/app/recipe/page.tsx:44:18)',
        '    at async handler (/var/task/node_modules/next/dist/run.js:1:1)',
    ].join('\n');

    equal(
        'skips framework frames and picks ours',
        significantFrame(stack),
        'at loadRecipe (/var/task/src/app/recipe/page.tsx',
    );
    equal('survives no stack at all', significantFrame(null), '');
    equal('survives a stack with only framework frames', significantFrame('Error: x\n    at node:internal/foo:1:1'), '');

    suite('fingerprint');

    const a = { source: 'client' as const, message: 'Recipe 7 not found', stack };
    const b = { source: 'client' as const, message: 'Recipe 99 not found', stack };
    const c = { source: 'server' as const, message: 'Recipe 7 not found', stack };
    const d = { source: 'client' as const, message: 'Something else', stack };

    equal('the same problem fingerprints the same', fingerprint(a), fingerprint(b));
    check('a different message does not', fingerprint(a) !== fingerprint(d), true);
    check('and neither does the same message from the server', fingerprint(a) !== fingerprint(c), true);
    check('it is short enough to store and read', fingerprint(a).length === 32, fingerprint(a).length);

    suite('safePath');

    // An error report is not a place to start collecting what people searched
    // for, and an invite code in a query string would be worse.
    equal('drops the query string', safePath('/de/?search=Geburtstagskuchen'), '/de/');
    equal('drops it from an absolute URL too', safePath('https://x.example/de/register?invite=abc'), '/de/register');
    equal('keeps a plain path', safePath('/de/recipe/kaesespaetzle'), '/de/recipe/kaesespaetzle');
    equal('survives nothing', safePath(null), null);
    // Nonsense is resolved against a placeholder origin and comes back
    // percent-encoded. Ugly, but it is still a path and still has no query
    // string, which is the property that matters here.
    equal('survives nonsense', safePath('not a path at all'), '/not%20a%20path%20at%20all');

    suite('prepareErrorReport');

    const prepared = prepareErrorReport({
        source: 'client',
        message: 'x'.repeat(900),
        stack: 'y'.repeat(9000),
        path: '/de/?search=secret',
    });

    check('truncates a runaway message', prepared.message.length === 500, prepared.message.length);
    check('truncates a runaway stack', (prepared.stack ?? '').length === 4000, prepared.stack?.length);
    equal('and the path is already clean', prepared.path, '/de/');
    equal('source is carried through', prepared.source, 'client');

    /*
     * The path is cleaned, but a failed fetch names its URL in the message,
     * and a stack frame can too. The reset link and the invitation are the
     * two places a secret rides in a query string.
     */
    const leaky = prepareErrorReport({
        source: 'client',
        message: 'Failed to fetch https://cookbook.example/de/reset?token=abc123DEF&x=1',
        stack: 'Error\n    at go (https://cookbook.example/de/register?invite=SECRET99:3:4)',
        path: '/de/reset?token=abc123DEF',
    });
    check('a reset token in the message is blanked', !leaky.message.includes('abc123DEF'), leaky.message);
    check('but the rest of the message survives', leaky.message.includes('Failed to fetch') && leaky.message.includes('x=1'), leaky.message);
    check('an invitation code in the stack is blanked', !(leaky.stack ?? '').includes('SECRET99'), leaky.stack);
    equal('and the path never carried it', leaky.path, '/de/reset');
}
