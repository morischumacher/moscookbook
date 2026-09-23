/** apiMessage — the one reader of a failed request's body */
import { suite, equal } from './harness';
import { messageFrom } from '../src/lib/apiMessage';

/** A Response, as far as this function is concerned. */
function answering(body: string): Response {
    return {
        json: async () => JSON.parse(body) as unknown,
    } as unknown as Response;
}

export default async function apiMessageTests() {
    suite('messageFrom');

    const fallback = 'The recipe could not be saved.';

    equal(
        'the route said something, so that is what the person reads',
        await messageFrom(answering('{"message":"That address is already taken."}'), fallback),
        'That address is already taken.'
    );

    equal(
        'a body with no message falls back',
        await messageFrom(answering('{"recipe":{"id":4}}'), fallback),
        fallback
    );

    /*
     * The upload route used to answer `{ error }` while the other forty-eight
     * answered `{ message }`. It was changed rather than accommodated here —
     * reading both would have made the inconsistency permanent and invisible.
     */
    equal(
        'and so does the one shape this application does not use',
        await messageFrom(answering('{"error":"nope"}'), fallback),
        fallback
    );

    equal(
        'an empty message is not a message',
        await messageFrom(answering('{"message":"   "}'), fallback),
        fallback
    );

    equal(
        'a message that is not a string is not a message',
        await messageFrom(answering('{"message":{"de":"Nein"}}'), fallback),
        fallback
    );

    /*
     * The case this exists for. A 502 from the platform is an HTML error page,
     * and `await res.json()` on it throws — inside a `catch {}` that showed
     * nothing, which is how a failing deploy looked like a working one.
     */
    let threw = false;
    try {
        equal(
            'an HTML error page falls back instead of throwing',
            await messageFrom(
                { json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response,
                fallback
            ),
            fallback
        );
    } catch {
        threw = true;
    }
    equal('and really does not throw', threw, false);

    equal(
        'a body of null falls back',
        await messageFrom(answering('null'), fallback),
        fallback
    );

    equal(
        'so does a body that is a bare string',
        await messageFrom(answering('"nope"'), fallback),
        fallback
    );
}
