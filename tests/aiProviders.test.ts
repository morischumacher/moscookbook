import { suite, check, equal } from './harness';
import {
    capabilityFromEnv,
    canUseAi,
    assistsText,
    extractRecipeWithAi,
    extractWithKey,
    isValidModel,
    keysFromEnv,
    type AiKey,
} from '../src/lib/aiImport';

/**
 * The three providers, driven through a stubbed network.
 *
 * What is checked here is the part that cannot be checked by reading: that
 * each provider's request has the shape that provider actually wants, that each
 * one's answer is found in the place that provider actually puts it, and that
 * a failure moves to the next provider rather than to the user.
 *
 * The bodies are inspected rather than the responses trusted, because the
 * failure this guards against is a request that is well-formed JSON and wrong —
 * an image in Anthropic's envelope sent to OpenAI produces a 400 with a message
 * about "content", months after somebody last looked at this file.
 */

interface Sent {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
}

/** Records every request and answers each URL with a canned reply. */
function recordFetch(replies: Record<string, { status?: number; json: unknown }>) {
    const original = globalThis.fetch;
    const sent: Sent[] = [];

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const headers = (init?.headers ?? {}) as Record<string, string>;

        sent.push({
            url,
            headers,
            body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });

        const reply = replies[url];

        if (!reply) {
            return {
                ok: false,
                status: 404,
                text: async () => 'no such endpoint',
                json: async () => ({}),
            } as unknown as Response;
        }

        return {
            ok: (reply.status ?? 200) < 400,
            status: reply.status ?? 200,
            text: async () => JSON.stringify(reply.json),
            json: async () => reply.json,
        } as unknown as Response;
    }) as typeof globalThis.fetch;

    return { sent, restore: () => { globalThis.fetch = original; } };
}

const RECIPE = JSON.stringify({
    title: 'Ofengemüse mit Feta',
    description: '',
    category: 'Dinner',
    nationality: 'Greek',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 25,
    ingredients: [
        { amount: '1', item: 'Zucchini' },
        { amount: '200 g', item: 'Feta' },
        // An ingredient with no name at all — a model padding the array.
        { amount: '', item: '  ' },
    ],
    instructions: '1. Alles in den Ofen.',
});

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const anthropicKey: AiKey = { provider: 'anthropic', apiKey: 'sk-ant-TESTKEY-0000', model: null };
const openaiKey: AiKey = { provider: 'openai', apiKey: 'sk-TESTKEY-1111', model: null };
const googleKey: AiKey = { provider: 'google', apiKey: 'AIzaTESTKEY2222', model: null };

const TEXT = { kind: 'text' as const, text: 'Ofengemüse\n\n1 Zucchini\n200 g Feta' };
const IMAGE = { kind: 'image' as const, base64: 'aGVsbG8=', mediaType: 'image/png' };

export default async function aiProviderTests() {
    /* ------------------------------------------------------------ Anthropic */

    suite('ai: Anthropic');

    let net = recordFetch({ [ANTHROPIC]: { json: { content: [{ type: 'text', text: RECIPE }] } } });

    let recipe = await extractWithKey(anthropicKey, IMAGE);

    equal('the recipe comes back', recipe.title, 'Ofengemüse mit Feta');
    equal('an ingredient with no name is dropped', recipe.ingredients.length, 2);
    equal('numbers survive', recipe.cookMinutes, 25);

    let body = net.sent[0].body;
    equal('the key travels in x-api-key', net.sent[0].headers['x-api-key'], anthropicKey.apiKey);
    check('and the API version is sent', Boolean(net.sent[0].headers['anthropic-version']));
    check('the system prompt is a top-level field', typeof body.system === 'string');

    const anthropicContent = (body.messages as { content: { type: string }[] }[])[0].content;
    equal('an image is its own block type', anthropicContent[0].type, 'image');
    net.restore();

    /* --------------------------------------------------------------- OpenAI */

    suite('ai: OpenAI');

    net = recordFetch({ [OPENAI]: { json: { choices: [{ message: { content: RECIPE } }] } } });

    recipe = await extractWithKey(openaiKey, IMAGE);
    equal('the recipe comes back', recipe.title, 'Ofengemüse mit Feta');

    body = net.sent[0].body;
    equal(
        'the key travels as a bearer token',
        net.sent[0].headers.authorization,
        `Bearer ${openaiKey.apiKey}`
    );
    equal(
        'JSON mode is asked for',
        (body.response_format as { type: string }).type,
        'json_object'
    );
    check(
        'no token limit is sent, because the field name has moved',
        body.max_tokens === undefined && body.max_completion_tokens === undefined,
        Object.keys(body)
    );

    const messages = body.messages as { role: string; content: unknown }[];
    equal('the system prompt is a message', messages[0].role, 'system');

    const openaiContent = messages[1].content as { type: string; image_url?: { url: string } }[];
    equal('an image is an image_url part', openaiContent[1].type, 'image_url');
    check(
        'carrying a data URL rather than raw base64',
        openaiContent[1].image_url?.url.startsWith('data:image/png;base64,'),
        openaiContent[1].image_url?.url.slice(0, 40)
    );
    net.restore();

    /* --------------------------------------------------------------- Gemini */

    suite('ai: Google Gemini');

    net = recordFetch({
        [GEMINI]: { json: { candidates: [{ content: { parts: [{ text: RECIPE }] } }] } },
    });

    recipe = await extractWithKey(googleKey, IMAGE);
    equal('the recipe comes back', recipe.title, 'Ofengemüse mit Feta');

    equal('the key travels in a header', net.sent[0].headers['x-goog-api-key'], googleKey.apiKey);
    check(
        'and never in the URL, where it would land in every log',
        !net.sent[0].url.includes(googleKey.apiKey),
        net.sent[0].url
    );

    body = net.sent[0].body;
    check('a system instruction is sent', body.systemInstruction !== undefined);
    equal(
        'JSON is asked for',
        (body.generationConfig as { responseMimeType: string }).responseMimeType,
        'application/json'
    );

    const parts = (body.contents as { parts: Record<string, unknown>[] }[])[0].parts;
    check('an image is inline_data', parts[1].inline_data !== undefined, Object.keys(parts[1]));
    net.restore();

    /* ---------------------------------------------------- the model in a URL */

    suite('ai: the model name is not a path');

    check('an ordinary name is fine', isValidModel('gemini-2.0-flash'));
    check('so is a dotted one', isValidModel('gpt-4.1-mini'));
    check('and a colon', isValidModel('claude-sonnet-5:beta'));
    check('a traversal is refused', !isValidModel('../../../v1beta/models/x'));
    check('a slash is refused', !isValidModel('models/x'));
    check('a space is refused', !isValidModel('gpt 4'));
    check('an empty name is refused', !isValidModel(''));

    net = recordFetch({});
    let threw = '';
    try {
        await extractWithKey({ ...googleKey, model: '../elsewhere' }, TEXT);
    } catch (error) {
        threw = error instanceof Error ? error.message : '';
    }
    check('and never reaches the network', net.sent.length === 0, net.sent.length);
    check('with a message that says why', threw.includes('usable model name'), threw);
    net.restore();

    /* ----------------------------------------------------- the fallback chain */

    suite('ai: asking the next provider');

    net = recordFetch({
        [ANTHROPIC]: { status: 429, json: { error: 'rate limited' } },
        [OPENAI]: { json: { choices: [{ message: { content: RECIPE } }] } },
    });

    recipe = await extractRecipeWithAi(TEXT, [anthropicKey, openaiKey, googleKey]);

    equal('the second provider answers', recipe.title, 'Ofengemüse mit Feta');
    equal('and the third is never asked', net.sent.length, 2);
    net.restore();

    // A provider that answers with prose rather than JSON is broken for this
    // purpose, and the chain moves on.
    net = recordFetch({
        [ANTHROPIC]: { json: { content: [{ type: 'text', text: 'Sure! Here is a lovely recipe.' }] } },
        [OPENAI]: { json: { choices: [{ message: { content: RECIPE } }] } },
    });

    recipe = await extractRecipeWithAi(TEXT, [anthropicKey, openaiKey]);
    equal('prose counts as a failure', recipe.title, 'Ofengemüse mit Feta');
    net.restore();

    // All of them down: the error names all of them, not just the last.
    net = recordFetch({
        [ANTHROPIC]: { status: 401, json: { error: 'bad key' } },
        [OPENAI]: { status: 500, json: { error: 'oops' } },
    });

    threw = '';
    try {
        await extractRecipeWithAi(TEXT, [anthropicKey, openaiKey]);
    } catch (error) {
        threw = error instanceof Error ? error.message : '';
    }

    check('the failure names Anthropic', threw.includes('Anthropic'), threw);
    check('and OpenAI', threw.includes('OpenAI'), threw);
    net.restore();

    // A provider echoing the key back does not put it on an admin's screen.
    net = recordFetch({
        [OPENAI]: { status: 401, json: { error: `Incorrect API key provided: ${openaiKey.apiKey}` } },
    });

    threw = '';
    try {
        await extractWithKey(openaiKey, TEXT);
    } catch (error) {
        threw = error instanceof Error ? error.message : '';
    }

    check('a key echoed in an error is scrubbed out', !threw.includes(openaiKey.apiKey), threw);
    check('and something is left to read', threw.includes('«key»'), threw);
    net.restore();

    equal('no keys at all is refused before any request', await noKeys(), 'AI import is not configured.');

    /* ----------------------------------------------------- reading the settings */

    suite('ai: what the environment says');

    const previous = {
        anthropic: process.env.ANTHROPIC_API_KEY,
        openai: process.env.OPENAI_API_KEY,
        google: process.env.GOOGLE_AI_API_KEY,
        gemini: process.env.GEMINI_API_KEY,
    };

    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    equal('with nothing set there are no keys', keysFromEnv().length, 0);
    check('and the capability is off', !canUseAi(capabilityFromEnv()));
    check('so nothing is asked about text either', !assistsText(capabilityFromEnv()));

    process.env.ANTHROPIC_API_KEY = 'sk-ant-env';
    equal('one variable is one key', keysFromEnv().length, 1);
    check('and the capability is usable', canUseAi(capabilityFromEnv()));
    check('including for text', assistsText(capabilityFromEnv()));

    process.env.GEMINI_API_KEY = 'AIza-env';
    equal('GEMINI_API_KEY is accepted as well as GOOGLE_AI_API_KEY', keysFromEnv().length, 2);

    // The named modes, which is what the admin screen writes.
    check('off means off even with keys', !canUseAi({ mode: 'off', keys: keysFromEnv() }));
    check(
        'pictures-only is usable but does not assist text',
        canUseAi({ mode: 'images', keys: keysFromEnv() }) &&
            !assistsText({ mode: 'images', keys: keysFromEnv() })
    );
    check('and no keys is off whatever the mode', !canUseAi({ mode: 'always', keys: [] }));

    for (const [name, value] of [
        ['ANTHROPIC_API_KEY', previous.anthropic],
        ['OPENAI_API_KEY', previous.openai],
        ['GOOGLE_AI_API_KEY', previous.google],
        ['GEMINI_API_KEY', previous.gemini],
    ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
}

async function noKeys(): Promise<string> {
    try {
        await extractRecipeWithAi(TEXT, []);
        return 'no error';
    } catch (error) {
        return error instanceof Error ? error.message : '';
    }
}
