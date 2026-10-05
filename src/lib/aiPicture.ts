import { providerError, type ModelReport, type TokenUsage } from './aiImport';
import type { AiKey, AiProvider } from './aiProviders';
import { scrub } from './secretBox';

/**
 * "Bild mit KI erzeugen": a picture of the finished dish for a recipe that
 * has none (work #32).
 *
 * Only OpenAI and Google can paint; an Anthropic key is skipped rather than
 * asked, since a call that cannot succeed still takes time. The keys are
 * passed in, like everywhere in the AI code, so this module never reaches the
 * database and the tests can load it (see aiImport.ts).
 */

/** The providers whose keys can make a picture, in no particular order. */
const PAINTERS: readonly AiProvider[] = ['openai', 'google'];

export const OPENAI_IMAGE_MODEL = 'gpt-image-1';
export const GOOGLE_IMAGE_MODEL = 'gemini-2.5-flash-image';

/** Painting takes a while; the route may run for sixty seconds in all. */
const TIMEOUT_MS = 55_000;

export function canPaint(keys: AiKey[]): boolean {
    return keys.some((key) => PAINTERS.includes(key.provider));
}

/**
 * What the model is asked for. The ingredients say what is in the dish — a
 * title like "Omas Sonntagsessen" says nothing — but only the first few, and
 * without amounts: the picture is of the dish, not of its shopping list.
 */
export function picturePrompt(title: string, ingredients: string[]): string {
    const named = ingredients
        .map((line) => line.replace(/^##\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 15);

    return [
        `An appetising, natural food photograph of the finished dish "${title.trim()}", plated and ready to eat.`,
        named.length > 0 ? `It is made with: ${named.join(', ')}.` : '',
        'Soft natural daylight, shallow depth of field, a simple table setting, seen slightly from above.',
        'Styled for a personal cookbook: honest home cooking, not an advertisement.',
        'No text, no lettering, no logos, no people and no hands in the picture.',
    ]
        .filter(Boolean)
        .join(' ');
}

export type PictureOutcome =
    | { ok: true; bytes: Uint8Array; contentType: string; provider: AiProvider }
    | { ok: false; reason: 'no-keys' | 'error'; message: string };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function decode(base64: string): Uint8Array {
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

interface Painted {
    bytes: Uint8Array;
    contentType: string;
    model: string;
    usage: TokenUsage | null;
}

async function paintWithOpenAi(key: AiKey, prompt: string, fetchImpl: FetchLike): Promise<Painted> {
    const response = await fetchImpl('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size: '1536x1024', n: 1 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw providerError('openai', response.status, await response.text().catch(() => ''), key.apiKey);

    const payload = (await response.json().catch(() => null)) as {
        data?: { b64_json?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
    } | null;
    const data = payload?.data?.[0]?.b64_json;
    if (typeof data !== 'string' || data === '') throw new Error('OpenAI returned no picture.');

    return {
        bytes: decode(data),
        contentType: 'image/png',
        model: OPENAI_IMAGE_MODEL,
        usage: payload?.usage ? { input: count(payload.usage.input_tokens), output: count(payload.usage.output_tokens) } : null,
    };
}

async function paintWithGoogle(key: AiKey, prompt: string, fetchImpl: FetchLike): Promise<Painted> {
    const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_IMAGE_MODEL}:generateContent`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key.apiKey },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ['IMAGE'] },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        }
    );
    if (!response.ok) throw providerError('google', response.status, await response.text().catch(() => ''), key.apiKey);

    const payload = (await response.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    } | null;
    const inline = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part.inlineData?.data === 'string')?.inlineData;
    if (!inline?.data) throw new Error('Gemini returned no picture.');

    const meta = payload?.usageMetadata;
    return {
        bytes: decode(inline.data),
        contentType: inline.mimeType?.startsWith('image/') ? inline.mimeType : 'image/png',
        model: GOOGLE_IMAGE_MODEL,
        usage: meta ? { input: count(meta.promptTokenCount), output: count(meta.candidatesTokenCount) } : null,
    };
}

/**
 * The first picture any key manages to paint. A key that fails is followed
 * by the next one; the reasons are kept, with every key scrubbed out of them,
 * for the one message the route sends back.
 */
export async function generatePicture(
    keys: AiKey[],
    prompt: string,
    fetchImpl: FetchLike = fetch,
    report?: ModelReport
): Promise<PictureOutcome> {
    const painters = keys.filter((key) => PAINTERS.includes(key.provider));
    if (painters.length === 0) {
        return { ok: false, reason: 'no-keys', message: 'Pictures need an OpenAI or Google key.' };
    }

    const failures: string[] = [];
    for (const key of painters) {
        try {
            const painted =
                key.provider === 'openai'
                    ? await paintWithOpenAi(key, prompt, fetchImpl)
                    : await paintWithGoogle(key, prompt, fetchImpl);
            report?.(key.provider, painted.model, painted.usage);
            if (painted.bytes.length === 0) throw new Error('The picture was empty.');
            return { ok: true, bytes: painted.bytes, contentType: painted.contentType, provider: key.provider };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(scrub(message, ...keys.map((each) => each.apiKey)));
        }
    }

    return { ok: false, reason: 'error', message: failures.join(' · ').slice(0, 300) };
}
