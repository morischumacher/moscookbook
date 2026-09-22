import { z } from 'zod';
import type { ParsedRecipe } from './recipeParser';
import { scrub } from './secretBox';

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
/* What a provider is                                                          */
/* -------------------------------------------------------------------------- */

export type AiProvider = 'anthropic' | 'openai' | 'google';

/** The order the admin screen draws them in, and nothing more. */
export const AI_PROVIDERS: readonly AiProvider[] = ['anthropic', 'openai', 'google'];

export function isAiProvider(value: string): value is AiProvider {
    return (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Defaults, and two of them are a guess with a shelf life.
 *
 * Google's is not, and that is worth the note. `gemini-flash-latest` is an
 * **alias** that Google points at whatever the current Flash model is — it
 * came out of the copy-pasteable cURL in Google's own console, which is where
 * a name that stays right is most likely to be found. This used to say
 * `gemini-2.0-flash`, pinned, and by the time anybody read it the console was
 * offering Gemini 3 and the pin was a name for something two generations old.
 *
 * The other two are pinned because those providers do not publish an
 * equivalent alias that is safe to rely on, and a wrong guess there is at
 * least a loud one: every model name is overridable on the admin screen, and
 * the "test" button reports the provider's own error verbatim, which for a
 * model that does not exist is a sentence naming it. That is the mitigation —
 * not being right forever, but being obviously wrong in one click.
 */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
    anthropic: 'claude-sonnet-5',
    openai: 'gpt-4o',
    google: 'gemini-flash-latest',
};

/** Human-readable, for error messages that an admin reads. */
export const PROVIDER_LABEL: Record<AiProvider, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google Gemini',
};

/**
 * A model name, as far as anything here will accept one.
 *
 * This is a validation with teeth rather than a tidy-up: Gemini puts the model
 * **in the URL path**, so a model of `../../../v1beta/models/x` is a request to
 * somewhere else entirely, and the field it comes from is a text input on an
 * admin page. Allowing letters, digits and four punctuation marks closes that
 * without rejecting any real name.
 */
const MODEL_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

export function isValidModel(value: string): boolean {
    return MODEL_PATTERN.test(value);
}

export interface AiKey {
    provider: AiProvider;
    apiKey: string;
    /** Null means this provider's default. */
    model: string | null;
}

/**
 * When the AI is allowed to be asked.
 *
 * `images`, not `always`, is what the cookbook did for its first year: a
 * photograph is pixels and no rule reads pixels, so that one path had no
 * alternative. Everything else always had one, so asking was a choice.
 *
 *   off     — never. The rules, and nothing else, whatever keys are configured.
 *   images  — only where there is no rule at all: a screenshot, a photograph.
 *   always  — also as a *second* attempt when the rules come up short.
 *
 * `always` is still rules-first everywhere. There is no mode in which a page
 * with clean structured data costs money.
 */
export type AssistMode = 'off' | 'images' | 'always';

export const ASSIST_MODES: readonly AssistMode[] = ['off', 'images', 'always'];

export function isAssistMode(value: string): value is AssistMode {
    return (ASSIST_MODES as readonly string[]).includes(value);
}

/**
 * Everything a caller needs to decide whether to ask, and whom.
 *
 * Passed down rather than looked up, for the reason at the top of this file.
 */
export interface AiCapability {
    mode: AssistMode;
    /** In the order they should be tried. Empty means nothing is configured. */
    keys: AiKey[];
}

export const NO_AI: AiCapability = { mode: 'off', keys: [] };

/** Whether this capability can actually be used. */
export function canUseAi(ai: AiCapability): boolean {
    return ai.mode !== 'off' && ai.keys.length > 0;
}

/** Whether it may be used for something the rules could also have a go at. */
export function assistsText(ai: AiCapability): boolean {
    return ai.mode === 'always' && ai.keys.length > 0;
}

/**
 * The keys in the environment, which still work.
 *
 * This is the whole of the old behaviour, kept: a deployment that sets
 * `ANTHROPIC_API_KEY` and never opens the admin screen behaves exactly as it
 * did. It is also what the tests drive, which is why it lives in this
 * database-free module rather than next to the rows.
 */
export function keysFromEnv(): AiKey[] {
    const keys: AiKey[] = [];

    const anthropic = process.env.ANTHROPIC_API_KEY;
    if (anthropic) {
        keys.push({
            provider: 'anthropic',
            apiKey: anthropic,
            model: process.env.ANTHROPIC_MODEL || null,
        });
    }

    const openai = process.env.OPENAI_API_KEY;
    if (openai) {
        keys.push({ provider: 'openai', apiKey: openai, model: process.env.OPENAI_MODEL || null });
    }

    const google = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (google) {
        keys.push({ provider: 'google', apiKey: google, model: process.env.GOOGLE_AI_MODEL || null });
    }

    return keys;
}

/**
 * The capability from the environment alone, for callers that have no database
 * connection to hand — which today means the tests.
 *
 * `always` rather than `images`: the person who set a key set it to be used,
 * and the admin screen is where that gets narrowed.
 */
export function capabilityFromEnv(): AiCapability {
    const keys = keysFromEnv();
    return { mode: keys.length > 0 ? 'always' : 'off', keys };
}

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

function extractJson(text: string): unknown {
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
        readonly transient: boolean
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

    return new ProviderError(
        `${PROVIDER_LABEL[provider]} returned ${status}: ${scrub(body, apiKey).slice(0, 300)}`,
        transient
    );
}

function isTransient(error: unknown): boolean {
    return error instanceof ProviderError && error.transient;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* The three of them                                                           */
/* -------------------------------------------------------------------------- */

interface AnthropicBlock {
    type: string;
    text?: string;
}

async function callAnthropic(key: AiKey, source: AiSource): Promise<string> {
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

    const payload = (await response.json()) as { content?: AnthropicBlock[] };
    return (payload.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');
}

interface OpenAiPayload {
    choices?: { message?: { content?: string | null } }[];
}

async function callOpenAi(key: AiKey, source: AiSource): Promise<string> {
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
    return payload.choices?.[0]?.message?.content ?? '';
}

interface GeminiPayload {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
}

async function callGoogle(key: AiKey, source: AiSource): Promise<string> {
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
    return (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('\n');
}

const CALLS: Record<AiProvider, (key: AiKey, source: AiSource) => Promise<string>> = {
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

export async function completeWithKey(key: AiKey, source: AiSource): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await CALLS[key.provider](key, source);
        } catch (error) {
            if (attempt >= RETRIES.length || !isTransient(error)) throw error;
            await sleep(RETRIES[attempt]);
        }
    }
}

export async function extractWithKey(key: AiKey, source: AiSource): Promise<AiExtractionResult> {
    const text = await completeWithKey(key, source);

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
    keys: AiKey[]
): Promise<AiExtractionResult> {
    if (keys.length === 0) throw new Error('AI import is not configured.');

    const failures: string[] = [];

    for (const key of keys) {
        try {
            return await extractWithKey(key, source);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
        }
    }

    throw new Error(failures.join(' · '));
}
