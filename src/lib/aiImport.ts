import { z } from 'zod';
import type { ParsedRecipe } from './recipeParser';
import { scrub } from './secretBox';
import { DEFAULT_MODEL, PROVIDER_LABEL, isValidModel, modelsFor, type AiKey, type AiProvider } from './aiProviders';

// The vocabulary lives in aiProviders now; re-exported so that every
// importer of this module keeps working unchanged.
export type { AiProvider, AiKey, AssistMode, AiCapability } from './aiProviders';
export { AI_PROVIDERS, isAiProvider, DEFAULT_MODEL, PROVIDER_LABEL, isValidModel, ASSIST_MODES, isAssistMode, canUseAi, assistsText, keysFromEnv, capabilityFromEnv } from './aiProviders';

/**
 * Optional AI-assisted recipe extraction, across three providers.
 *
 * Two things about this module are load-bearing and easy to break later:
 *
 * **It never reaches the database.** `captureProcess` imports it, the tests
 * import `captureProcess`, and the test runner cannot load a module that pulls
 * in Prisma. So the *keys* are passed in rather than looked up here, and the
 * looking up lives in `aiConfig.ts`, which the routes import and the tests do
 * not. That separation is not tidiness; it is the difference between a test
 * suite that runs and one that does not.
 *
 * **Nothing here is ever required.** Every caller has a rule-based answer to
 * fall back to, and a missing key, a dead provider or a nonsense response all
 * come out the same way: the rules' answer, unchanged. The cookbook has to
 * keep working on a month with no AI budget, on a provider's bad afternoon,
 * and for somebody who simply does not want to use one.
 *
 * Three providers rather than one because they fail independently and because
 * a person should not have to hold an account with a particular company to
 * photograph a cookbook page. They are asked in order and the second is only
 * asked when the first *fails* — not when it answers badly, which would be a
 * way to pay twice for the same answer.
 */

/* -------------------------------------------------------------------------- */
/* The shape a provider has to produce                                         */
/* -------------------------------------------------------------------------- */

const aiRecipeSchema = z.object({
    title: z.string().default(''),
    description: z.string().default(''),
    category: z.string().default(''),
    nationality: z.string().default(''),
    ingredients: z
        .array(
            z.object({
                amount: z.string().default(''),
                item: z.string().default(''),
            })
        )
        .default([]),
    instructions: z.string().default(''),
    servings: z.number().int().min(1).max(100).nullable().default(null),
    prepMinutes: z.number().int().min(0).max(10_000).nullable().default(null),
    cookMinutes: z.number().int().min(0).max(10_000).nullable().default(null),
});

export interface AiExtractionResult extends ParsedRecipe {
    category: string;
    nationality: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
}

const SYSTEM_PROMPT = `You extract recipes into structured data.

Return ONLY a JSON object, no prose and no code fences, with exactly these keys:
{"title": string, "description": string, "category": string, "nationality": string,
 "servings": number|null, "prepMinutes": number|null, "cookMinutes": number|null,
 "ingredients": [{"amount": string, "item": string}], "instructions": string}

Rules:
- Keep the language of the source. Do not translate.
- "amount" holds the quantity and unit together, e.g. "200 g", "2 EL", "1/2".
  Leave it as an empty string when the source gives no quantity.
- "item" is the ingredient alone, without the quantity.
- "instructions" is markdown: one numbered list item per step, separated by blank lines.
- "category" is a single word like Breakfast, Lunch, Dinner, Dessert — or "" if unclear.
- "nationality" is the cuisine, e.g. Italian, German — or "" if unclear.
- "servings", "prepMinutes" and "cookMinutes" are numbers taken from the source,
  or null when the source does not state them. Never estimate them.
- Never invent ingredients, quantities or steps that are not in the source.
  If something is missing, leave it empty.
- If the source is not a recipe at all, return the object with every field empty.`;

export type AiSource =
    | { kind: 'text'; text: string }
    | { kind: 'image'; base64: string; mediaType: string }
    /**
     * Some text, a system prompt of the caller's own, and no recipe schema.
     *
     * Added for the two "revise what I wrote" buttons, which want a piece of
     * text back rather than a recipe object. It goes through this module
     * rather than round it so that the provider envelopes, the key handling
     * and the fallback chain have exactly one implementation — the alternative
     * is a second set of three provider calls that drift from these.
     */
    | { kind: 'raw'; system: string; text: string };

function systemFor(source: AiSource): string {
    return source.kind === 'raw' ? source.system : SYSTEM_PROMPT;
}

function promptFor(source: AiSource): string {
    if (source.kind === 'raw') return source.text;
    return source.kind === 'text'
        ? `Extract the recipe from this text:\n\n${source.text}`
        : 'Extract the recipe shown in this image.';
}

export function extractJson(text: string): unknown {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

    try {
        return JSON.parse(trimmed);
    } catch {
        // Fall back to the outermost object in the response.
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start === -1 || end <= start) return null;
        try {
            return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}

/**
 * A provider's failure, with the key taken out of it and the length capped.
 *
 * Both halves matter. Providers put the rejected credential in the body of a
 * 401 — and this string is shown on an admin page and written to a column that
 * ends up in a dump. Three hundred characters is enough to name a model that
 * does not exist, which is what an admin is nearly always reading this for.
 */
class ProviderError extends Error {
    constructor(
        message: string,
        /** True when trying the same thing again in a moment might work. */
        readonly transient: boolean,
        /**
         * True when the *model* is the problem rather than the key or the
         * request: busy, out of quota, or gone. Those are worth trying another
         * model for; a 401 is not, and walking a list of models on a bad key
         * turns one refusal into five.
         */
        readonly modelFault: boolean = false
    ) {
        super(message);
        this.name = 'ProviderError';
    }
}

/**
 * Statuses that mean "not now" rather than "not ever".
 *
 * 503 is the one that prompted this: Gemini answers it when the model is busy,
 * and its own message says "spikes in demand are usually temporary, please try
 * again later". 502 and 504 are gateways, 500 is a bad minute. None of them is
 * anything to do with the key.
 *
 * 401, 403 and 404 are deliberately not here. A wrong key and a model that
 * does not exist do not get better by asking twice.
 */
const TRANSIENT = new Set([500, 502, 503, 504]);

/**
 * 429 is two different errors wearing one number, and telling them apart
 * turned out to matter.
 *
 * A *rate* limit — too many requests this minute — is the textbook transient
 * failure and a second of patience fixes it. A *quota* — "you exceeded your
 * current quota, please check your plan and billing details" — is a wall, and
 * asking again is a request that was never going to succeed, sent twice more,
 * while somebody waits.
 *
 * Seen in the wild on a free Gemini tier: 503, 503, then a quota 429. Retrying
 * that third answer would have added nothing but seconds. Google says which it
 * is in the message, so the message is read.
 */
function isQuota(body: string): boolean {
    return /quota|billing|plan and billing|exceeded your current quota/i.test(body);
}

function providerError(provider: AiProvider, status: number, body: string, apiKey: string): Error {
    const transient = status === 429 ? !isQuota(body) : TRANSIENT.has(status);

    // Busy, rationed, or gone. All three are answered by asking a different
    // model; none of them is answered by asking the same one again tomorrow.
    const modelFault = status === 503 || status === 404 || (status === 429 && isQuota(body));

    return new ProviderError(
        `${PROVIDER_LABEL[provider]} returned ${status}: ${scrub(body, apiKey).slice(0, 300)}`,
        transient,
        modelFault
    );
}

function isTransient(error: unknown): boolean {
    return error instanceof ProviderError && error.transient;
}

function isModelFault(error: unknown): boolean {
    return error instanceof ProviderError && error.modelFault;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* The three of them                                                           */
/* -------------------------------------------------------------------------- */

interface AnthropicBlock {
    type: string;
    text?: string;
}

/**
 * What a call cost, in the provider's own count: tokens read and written.
 * Every provider sends it with the answer; it used to be thrown away.
 */
export interface TokenUsage {
    input: number;
    output: number;
}

interface Answered {
    text: string;
    usage: TokenUsage | null;
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

async function callAnthropic(key: AiKey, source: AiSource): Promise<Answered> {
    const content =
        source.kind === 'image'
            ? [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: source.mediaType, data: source.base64 },
                },
                { type: 'text', text: promptFor(source) },
            ]
            : [{ type: 'text', text: promptFor(source) }];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': key.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: key.model || DEFAULT_MODEL.anthropic,
            max_tokens: 4096,
            system: systemFor(source),
            messages: [{ role: 'user', content }],
        }),
    });

    if (!response.ok) {
        throw providerError(
            'anthropic',
            response.status,
            await response.text().catch(() => ''),
            key.apiKey
        );
    }

    const payload = (await response.json()) as {
        content?: AnthropicBlock[];
        usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
        text: (payload.content ?? [])
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('\n'),
        usage: payload.usage
            ? { input: count(payload.usage.input_tokens), output: count(payload.usage.output_tokens) }
            : null,
    };
}

interface OpenAiPayload {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function callOpenAi(key: AiKey, source: AiSource): Promise<Answered> {
    const content =
        source.kind === 'image'
            ? [
                { type: 'text', text: promptFor(source) },
                {
                    type: 'image_url',
                    // OpenAI takes an image as a data URL rather than as a
                    // separate field — the same bytes, a different envelope.
                    image_url: { url: `data:${source.mediaType};base64,${source.base64}` },
                },
            ]
            : [{ type: 'text', text: promptFor(source) }];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${key.apiKey}`,
        },
        body: JSON.stringify({
            model: key.model || DEFAULT_MODEL.openai,
            // Deliberately no token limit. The field for one has been renamed
            // once already and the newer models reject the old name outright —
            // a request that fails on an *argument* rather than on the work is
            // the worst kind of thing to debug from a recipe import. What comes
            // back here is a small object either way.
            // JSON mode only when JSON is wanted. Asking for it while handing
            // the model a proof-reading job produces `{"text": "..."}` — or a
            // refusal, since the prompt never mentions JSON.
            ...(source.kind === 'raw' ? {} : { response_format: { type: 'json_object' } }),
            messages: [
                { role: 'system', content: systemFor(source) },
                { role: 'user', content },
            ],
        }),
    });

    if (!response.ok) {
        throw providerError(
            'openai',
            response.status,
            await response.text().catch(() => ''),
            key.apiKey
        );
    }

    const payload = (await response.json()) as OpenAiPayload;
    return {
        text: payload.choices?.[0]?.message?.content ?? '',
        usage: payload.usage
            ? { input: count(payload.usage.prompt_tokens), output: count(payload.usage.completion_tokens) }
            : null,
    };
}

interface GeminiPayload {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

async function callGoogle(key: AiKey, source: AiSource): Promise<Answered> {
    const model = key.model || DEFAULT_MODEL.google;

    // The model goes in the path, so it is checked before it gets there.
    // `isValidModel` is also enforced when the row is written; this is the
    // second of the two, because the row could have been written by an older
    // version that did not check.
    if (!isValidModel(model)) {
        throw new Error(`${PROVIDER_LABEL.google}: "${model}" is not a usable model name.`);
    }

    const parts =
        source.kind === 'image'
            ? [
                { text: promptFor(source) },
                { inline_data: { mime_type: source.mediaType, data: source.base64 } },
            ]
            : [{ text: promptFor(source) }];

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                // In a header rather than as `?key=`, which Google's own
                // examples use. A key in a query string is a key in an access
                // log, a proxy log and a browser history.
                'x-goog-api-key': key.apiKey,
            },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemFor(source) }] },
                contents: [{ role: 'user', parts }],
                ...(source.kind === 'raw'
                    ? {}
                    : { generationConfig: { responseMimeType: 'application/json' } }),
            }),
        }
    );

    if (!response.ok) {
        throw providerError(
            'google',
            response.status,
            await response.text().catch(() => ''),
            key.apiKey
        );
    }

    const payload = (await response.json()) as GeminiPayload;
    const usage = payload.usageMetadata;
    return {
        text: (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('\n'),
        // Thinking is billed as output, so it is counted as output.
        usage: usage
            ? { input: count(usage.promptTokenCount), output: count(usage.candidatesTokenCount) + count(usage.thoughtsTokenCount) }
            : null,
    };
}

const CALLS: Record<AiProvider, (key: AiKey, source: AiSource) => Promise<Answered>> = {
    anthropic: callAnthropic,
    openai: callOpenAi,
    google: callGoogle,
};

/* -------------------------------------------------------------------------- */
/* Asking                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Asks one provider and parses what comes back.
 *
 * Exported for the "test" button, which wants a single provider's answer or a
 * single provider's error rather than the fallback chain's summary.
 */
/**
 * How many times a busy provider is asked again, and how long between.
 *
 * **One** extra attempt, after 800ms. It was two, and a real run showed why
 * that was too many: Gemini's own 503 took five seconds to arrive, then four,
 * then three — so three attempts plus the waiting cost twelve and a half
 * seconds and still failed. That is a long time to stand in a supermarket
 * holding a phone, for an answer that was never coming.
 *
 * One retry covers the case this is for — a spike that is over in a moment —
 * and gives up while the person is still holding the thing. A provider that is
 * down for longer is a provider the rules should be covering for, which they
 * do, immediately, which is the whole architecture.
 */
const RETRIES = [800];

/**
 * Told which model ended up answering, so it can be remembered.
 *
 * A callback rather than a return value because this module must not reach the
 * database — `captureProcess` imports it and the test suite imports that, and
 * the suite cannot load Prisma. The callers that can persist it pass one; the
 * ones that cannot pass nothing and the switch lasts for one request.
 */
export type ModelReport = (provider: AiProvider, model: string, usage?: TokenUsage | null) => void;

/**
 * One provider, every model it might answer on.
 *
 * Two loops, and they are about different things. The inner one retries the
 * *same* model once, for a spike that is over in a moment. The outer one moves
 * to the *next* model, for a model that is busy, rationed or gone — and only
 * for those three, so that a bad key still fails once rather than five times.
 *
 * The first model that answers ends both loops and is reported.
 */
export async function completeWithKey(
    key: AiKey,
    source: AiSource,
    report?: ModelReport
): Promise<string> {
    const models = modelsFor(key);
    const failures: string[] = [];

    for (const model of models) {
        const attempt: AiKey = { ...key, model };

        for (let retry = 0; ; retry += 1) {
            try {
                const answer = await CALLS[key.provider](attempt, source);
                // Reported before anything is done with the text: an answer
                // that turns out to be unusable was still paid for.
                report?.(key.provider, model, answer.usage);
                return answer.text;
            } catch (error) {
                /*
                 * Retry first, move on second — and in that order, because the
                 * two overlap. A 503 is both transient *and* about the model:
                 * "high demand" is over in a moment often enough that one
                 * retry on the same model is the cheapest thing to try, and
                 * only when that fails is a different model worth the trip.
                 *
                 * A quota 429 is not transient, so it skips straight past this
                 * and onto the next model, which is the right shape: the
                 * ration is gone and waiting will not refill it.
                 */
                if (retry < RETRIES.length && isTransient(error)) {
                    await sleep(RETRIES[retry]);
                    continue;
                }

                if (isModelFault(error) && model !== models[models.length - 1]) {
                    failures.push(`${model}: ${error instanceof Error ? error.message : ''}`);
                    break;
                }

                throw error;
            }
        }
    }

    throw new Error(failures.join(' · ') || 'No model answered.');
}

export async function extractWithKey(
    key: AiKey,
    source: AiSource,
    report?: ModelReport
): Promise<AiExtractionResult> {
    const text = await completeWithKey(key, source, report);

    const parsed = aiRecipeSchema.safeParse(extractJson(text));
    if (!parsed.success) {
        throw new Error(`${PROVIDER_LABEL[key.provider]} did not return a usable recipe.`);
    }

    return {
        ...parsed.data,
        ingredients: parsed.data.ingredients.filter((ingredient) => ingredient.item.trim() !== ''),
    };
}

/**
 * Asks each configured provider in turn until one answers.
 *
 * Throws when they all fail, carrying every reason: "Anthropic returned 401"
 * on its own sends somebody to rotate a key that was fine, when what actually
 * happened is that three providers were asked and the model name was wrong in
 * all three.
 *
 * A provider that answers *badly* ends the chain like any other failure — a
 * model that returns prose instead of JSON is broken for this purpose — but a
 * provider that answers with an empty recipe does not. That is a real answer:
 * the picture did not have a recipe in it.
 */
export async function extractRecipeWithAi(
    source: AiSource,
    keys: AiKey[],
    report?: ModelReport
): Promise<AiExtractionResult> {
    if (keys.length === 0) throw new Error('AI import is not configured.');

    const failures: string[] = [];

    for (const key of keys) {
        try {
            return await extractWithKey(key, source, report);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
        }
    }

    throw new Error(failures.join(' · '));
}
