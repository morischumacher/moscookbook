import { suite, check, equal } from './harness';
import { canSeal, hintFor, open, seal, scrub } from '../src/lib/secretBox';

/**
 * The envelope the API keys live in.
 *
 * Worth testing properly rather than trusting, because every failure mode here
 * is silent. A seal that does not encrypt looks exactly like one that does
 * from the outside; a decrypt that ignores the auth tag accepts a tampered row
 * without a word; a rotated secret that throws instead of returning null takes
 * the admin page down rather than asking for the key again.
 */
export default function secretBoxTests() {
    suite('secretBox');

    const previous = process.env.SECRET_COOKIE_PASSWORD;
    const previousAi = process.env.AI_SECRET_KEY;
    delete process.env.AI_SECRET_KEY;

    process.env.SECRET_COOKIE_PASSWORD = 'a-test-secret-that-is-long-enough-32';

    check('with a secret, sealing is possible', canSeal());

    const key = 'sk-ant-api03-EXAMPLE-not-a-real-key-0000-4f2a';
    const envelope = seal(key);

    equal('it opens back to what went in', open(envelope), key);
    check('the key is not in the envelope', !envelope.includes(key), envelope);
    check('the envelope is versioned', envelope.startsWith('v1.'), envelope);

    // GCM wants a fresh IV each time; two identical plaintexts sealing to the
    // same string would mean it is not getting one.
    check('sealing twice gives two different envelopes', seal(key) !== seal(key));

    /* ------------------------------------------------------------ tampering */

    const parts = envelope.split('.');

    // A flipped bit in the ciphertext. Without the auth tag being checked this
    // would decrypt to something — and that something would be sent to a
    // provider as a key.
    const body = Buffer.from(parts[3], 'base64');
    body[0] ^= 0x01;
    const tampered = [parts[0], parts[1], parts[2], body.toString('base64')].join('.');
    equal('a tampered envelope does not open', open(tampered), null);

    equal('a truncated envelope does not open', open('v1.abc.def'), null);
    equal('an unknown version does not open', open(`v2.${parts[1]}.${parts[2]}.${parts[3]}`), null);
    equal('an empty string does not open', open(''), null);
    equal('nonsense does not open', open('not an envelope at all'), null);

    // A wrong-length IV reaching the cipher is a throw, not a null, unless it
    // is checked first.
    equal(
        'a short IV does not open',
        open(['v1', Buffer.alloc(8).toString('base64'), parts[2], parts[3]].join('.')),
        null
    );

    /* --------------------------------------------------- the rotation story */

    process.env.SECRET_COOKIE_PASSWORD = 'a-different-secret-also-long-enough32';
    equal('after rotating the secret, the envelope will not open', open(envelope), null);
    check('and it returns null rather than throwing', true);

    /* ------------------------------------------------------- no secret at all */

    delete process.env.SECRET_COOKIE_PASSWORD;
    check('with no secret, sealing is refused', !canSeal());
    equal('and nothing opens', open(envelope), null);

    // Too short to derive from is the same as absent, rather than being
    // quietly accepted and producing a weak key.
    process.env.SECRET_COOKIE_PASSWORD = 'short';
    check('a secret under 32 characters does not count', !canSeal());

    /* ----------------------------------------------------- the separate key */

    process.env.SECRET_COOKIE_PASSWORD = 'a-test-secret-that-is-long-enough-32';
    process.env.AI_SECRET_KEY = 'a-dedicated-ai-secret-long-enough-32c';

    const separate = seal(key);
    equal('AI_SECRET_KEY seals and opens on its own', open(separate), key);

    delete process.env.AI_SECRET_KEY;
    equal('and its envelopes do not open under the session secret', open(separate), null);

    /* ------------------------------------------------------------- the hint */

    equal('the hint is the last four characters', hintFor(key), '4f2a');
    equal('a short key still gives something', hintFor('abc'), 'abc');

    /* ---------------------------------------------------------- the scrubber */

    equal(
        'a key echoed in an error is removed',
        scrub(`Incorrect API key provided: ${key}`, key),
        'Incorrect API key provided: «key»'
    );

    check(
        'a key quoted only by its head is removed too',
        scrub(`Invalid key ${key.slice(0, 12)}...`, key).includes('«key»')
    );

    check(
        'and by its tail',
        scrub(`...${key.slice(-8)} was rejected`, key).includes('«key»')
    );

    equal(
        'a message with no key in it is untouched',
        scrub('model not found: gpt-9', key),
        'model not found: gpt-9'
    );

    // A short "secret" would match ordinary words and redact half the message.
    equal(
        'a too-short secret is not used as a pattern',
        scrub('the model is not available', 'the'),
        'the model is not available'
    );

    equal('no secret at all is harmless', scrub('plain message', undefined, null), 'plain message');

    /* ------------------------------------------------------------- put back */

    if (previous === undefined) delete process.env.SECRET_COOKIE_PASSWORD;
    else process.env.SECRET_COOKIE_PASSWORD = previous;

    if (previousAi === undefined) delete process.env.AI_SECRET_KEY;
    else process.env.AI_SECRET_KEY = previousAi;
}
