/**
 * What a provider is, and what a key and a capability are.
 *
 * Pulled out of aiImport, which held this next to three HTTP clients and a
 * system prompt. aiConfig — the module that holds the sealed keys — imported
 * exactly the nine names in here and nothing from the rest, and in doing so
 * pulled in every provider's wire format to learn what a provider *is*. The
 * admin screen did the same to draw a dropdown.
 *
 * Nothing here reaches a network or a database. The test file this is named
 * after existed before the module did, which was the tell.
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

/**
 * What to try when the first choice will not answer.
 *
 * A real run made the case for this. `gemini-flash-latest` — an alias that
 * always points at the current model, which is the right idea — answered 503
 * three times and then 429 "you exceeded your current quota". The fix was to
 * find a model that does answer and type its name into a box, which is a fix
 * that expires: the working model on a free tier changes with the week, and a
 * name typed in today is a name that is wrong in March.
 *
 * So the list is tried. Not on *any* failure — a bad key fails the same way on
 * every model, and walking a list would turn one refusal into seven — but on
 * the three that are specifically about the model: it is busy, its quota is
 * gone, or it does not exist any more.
 *
 * Ordered by what a recipe import wants: fast and cheap, because the work is
 * reading a page rather than reasoning about it. The lite models are in here
 * deliberately; they are entirely capable of turning an ingredient list into
 * JSON, and they are the ones with quota left.
 */
const MODEL_CANDIDATES: Record<AiProvider, string[]> = {
    google: [
        'gemini-flash-latest',
        'gemini-flash-lite-latest',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
    ],
    // No published alias worth relying on, and both providers charge rather
    // than rationing — a quota error there means a card to fix, not a model to
    // swap. A single entry keeps the machinery uniform without inventing
    // fallbacks nobody asked for.
    anthropic: ['claude-sonnet-5'],
    openai: ['gpt-4o'],
};

/**
 * The models to try for this key, in order.
 *
 * An explicitly chosen model goes first and is never dropped from the list:
 * somebody who typed a name in made a decision, and the most this may do is
 * carry on past it when it will not answer at all.
 */
export function modelsFor(key: AiKey): string[] {
    const candidates = MODEL_CANDIDATES[key.provider] ?? [DEFAULT_MODEL[key.provider]];
    const chosen = key.model?.trim();

    if (!chosen) return candidates;
    return [chosen, ...candidates.filter((model) => model !== chosen)];
}

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
