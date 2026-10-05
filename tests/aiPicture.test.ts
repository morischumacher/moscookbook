import { suite, check, equal } from './harness';
import { canPaint, generatePicture, picturePrompt } from '../src/lib/aiPicture';
import type { AiKey } from '../src/lib/aiImport';

/**
 * "Bild mit KI erzeugen" (work #32): which keys are asked, how each
 * provider's answer is read, and that no key ever ends up in a message.
 */
const anthropic: AiKey = { provider: 'anthropic', apiKey: 'sk-ant-TEST-ANTHROPIC-0000', model: null };
const openai: AiKey = { provider: 'openai', apiKey: 'sk-proj-TEST-OPENAI-1234567890', model: 'gpt-4o-mini' };
const google: AiKey = { provider: 'google', apiKey: 'AIzaTEST-GOOGLE-1234567890', model: null };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

interface Call {
    url: string;
    init: RequestInit;
}

function fakeFetch(answers: Record<string, () => Response>) {
    const calls: Call[] = [];
    const impl = async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const host = new URL(url).host;
        const answer = answers[host];
        if (!answer) throw new Error(`unexpected call to ${host}`);
        return answer();
    };
    return { impl, calls };
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async function aiPictureTests() {
    suite('aiPicture: the prompt');
    const prompt = picturePrompt(' Linsensuppe ', ['## Suppe', '250 g Linsen', '', '1 Zwiebel']);
    check('names the dish', prompt.includes('"Linsensuppe"'), prompt);
    check('lists what is in it, headings without their marks', prompt.includes('Suppe, 250 g Linsen, 1 Zwiebel'), prompt);
    check('asks for no text and no people', /No text/.test(prompt) && /no people/.test(prompt) && /no hands/.test(prompt));
    check('without ingredients there is no empty list', !picturePrompt('Brot', []).includes('made with'));

    suite('aiPicture: who can paint');
    check('an Anthropic key alone cannot', !canPaint([anthropic]));
    check('an OpenAI key can', canPaint([anthropic, openai]));

    const none = await generatePicture([anthropic], 'p', async () => {
        throw new Error('must not be called');
    });
    check('Anthropic only: nothing is asked', !none.ok && none.reason === 'no-keys', none);

    suite('aiPicture: OpenAI');
    const fromOpenAi = fakeFetch({
        'api.openai.com': () => json({ data: [{ b64_json: PNG.toString('base64') }], usage: { input_tokens: 40, output_tokens: 4000 } }),
    });
    const reported: unknown[] = [];
    const painted = await generatePicture([anthropic, openai], 'a soup', fromOpenAi.impl, (...args) => reported.push(args));
    check('a picture comes back', painted.ok && Buffer.from(painted.bytes).equals(PNG), painted);
    equal('the Anthropic key was skipped', fromOpenAi.calls.length, 1);
    equal('asked at the images endpoint', fromOpenAi.calls[0]?.url, 'https://api.openai.com/v1/images/generations');
    const openAiBody = JSON.parse(String(fromOpenAi.calls[0]?.init.body)) as Record<string, unknown>;
    equal('with the image model and a landscape size, not the chat model', [openAiBody.model, openAiBody.size, openAiBody.prompt], ['gpt-image-1', '1536x1024', 'a soup']);
    equal('its tokens are reported', reported, [['openai', 'gpt-image-1', { input: 40, output: 4000 }]]);

    suite('aiPicture: Google');
    const fromGoogle = fakeFetch({
        'generativelanguage.googleapis.com': () =>
            json({ candidates: [{ content: { parts: [{ text: 'Here you go' }, { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] }),
    });
    const gemini = await generatePicture([google], 'a soup', fromGoogle.impl);
    check('the picture in the parts is found', gemini.ok && gemini.contentType === 'image/png' && Buffer.from(gemini.bytes).equals(PNG), gemini);
    const googleCall = fromGoogle.calls[0];
    check('asked at the image model', googleCall?.url.includes('gemini-2.5-flash-image:generateContent'), googleCall?.url);
    check('with the key in a header, not the address', (googleCall?.init.headers as Record<string, string>)['x-goog-api-key'] === google.apiKey && !googleCall?.url.includes(google.apiKey));
    const googleBody = JSON.parse(String(googleCall?.init.body)) as { generationConfig?: { responseModalities?: string[] } };
    equal('for an image back', googleBody.generationConfig?.responseModalities, ['IMAGE']);

    suite('aiPicture: failures');
    const fallback = fakeFetch({
        'api.openai.com': () => json({ error: { message: `Incorrect API key provided: ${openai.apiKey}` } }, 401),
        'generativelanguage.googleapis.com': () =>
            json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] }),
    });
    const second = await generatePicture([openai, google], 'p', fallback.impl);
    check('a refused key is followed by the next', second.ok && second.provider === 'google', second);

    const failing = fakeFetch({
        'api.openai.com': () => json({ error: { message: `Incorrect API key provided: ${openai.apiKey}` } }, 401),
        'generativelanguage.googleapis.com': () => json({ error: { message: `API key not valid: ${google.apiKey}` } }, 400),
    });
    const failed = await generatePicture([openai, google], 'p', failing.impl);
    check('both failing is an error', !failed.ok && failed.reason === 'error', failed);
    check('that names the providers', !failed.ok && /OpenAI/.test(failed.message) && /Gemini|Google/.test(failed.message), failed);
    check('and carries no key', !failed.ok && !failed.message.includes(openai.apiKey) && !failed.message.includes(google.apiKey), failed);

    const thrown = await generatePicture([openai], 'p', async () => {
        throw new Error(`socket hang up while sending ${openai.apiKey}`);
    });
    check('a network error is scrubbed too', !thrown.ok && !thrown.message.includes(openai.apiKey), thrown);

    const empty = await generatePicture([openai], 'p', fakeFetch({ 'api.openai.com': () => json({ data: [] }) }).impl);
    check('an answer without a picture is an error, not an empty file', !empty.ok && /no picture/.test(empty.message), empty);
}
