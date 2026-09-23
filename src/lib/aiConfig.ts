import prisma from './prisma';
import { optionalTable, transactionTable } from './prismaTable';
import { canSeal, hintFor, open, seal } from './secretBox';
import {
    AI_PROVIDERS,
    DEFAULT_MODEL,
    type AiCapability,
    type AiKey,
    type AiProvider,
    type AssistMode,
    isAssistMode,
    isValidModel,
    keysFromEnv,
} from './aiProviders';

/**
 * Where the AI keys actually come from.
 *
 * **This is the only file in the application that reads the `secret` column**,
 * and `scripts/check-secrets.mjs` fails the build if that stops being true. The
 * rule is not a style preference: a sealed key is only as private as the
 * narrowest place it can be opened, and one careless `select` in a route
 * handler puts three API keys into a JSON response.
 *
 * Two sources, in this order:
 *
 *   1. **Rows.** What the admin screen writes. Sealed, orderable, deletable
 *      without a deploy.
 *   2. **The environment.** `ANTHROPIC_API_KEY` and friends, for a provider
 *      with no row. Kept working because a deployment that was set up that way
 *      should not break on an upgrade, and because a key in the environment is
 *      genuinely the better place for it when nobody needs to change it.
 *
 * A row wins over the environment for the same provider, and the admin screen
 * says so on the provider's card rather than leaving somebody to wonder which
 * key a failing import actually used. That question — *which key is this* —
 * is most of what made the environment variable annoying in the first place.
 */

const ASSIST_KEY = 'ai.assist';

/* -------------------------------------------------------------------------- */
/* A client that may not know about these tables yet — see lib/prismaTable    */
/* -------------------------------------------------------------------------- */

type Delegate = {
    findUnique: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
};

function table(name: 'appSetting' | 'aiCredential'): Delegate | null {
    return optionalTable<Delegate>(
        name,
        'findMany',
        'The AI features are switched off until you do; everything else works.'
    );
}

/**
 * What the assist mode is when nobody has chosen one.
 *
 * `always`, which is a change from the first year of this cookbook, and a
 * deliberate one: somebody who goes to the trouble of pasting a key in wants
 * it used. Narrowing it to pictures only, or switching it off entirely while
 * leaving the keys in place, is one tap on the same screen.
 */
const DEFAULT_ASSIST: AssistMode = 'always';

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

interface CredentialRow {
    provider: string;
    secret: string;
    model: string | null;
    enabled: boolean;
    priority: number;
    verifiedAt: Date | null;
}

/** A row as the admin screen is allowed to see it. Never carries a key. */
export interface AiCredentialView {
    provider: AiProvider;
    /** 'row' | 'env' | 'none' — where the key for this provider comes from. */
    origin: 'row' | 'env' | 'none';
    /** Last four characters, or null when it is not ours to show. */
    hint: string | null;
    /** Null means the provider's default, which is reported separately. */
    model: string | null;
    defaultModel: string;
    enabled: boolean;
    priority: number;
    checkedAt: string | null;
    checkError: string | null;
    /** Has this key ever been seen to work? Until it has, it is not used. */
    verified: boolean;
    /** Set when the model in `model` was chosen by a fallback, not by a person. */
    autoModelAt: string | null;
    /**
     * True when a row exists but its envelope will not open — which means the
     * session secret was rotated. The screen says so and asks for the key
     * again, because there is nothing else to be done and nothing is lost but
     * a paste.
     */
    unreadable: boolean;
}

export async function assistMode(): Promise<AssistMode> {
    const settings = table('appSetting');
    if (!settings) return DEFAULT_ASSIST;

    const row = (await settings
        .findUnique({ where: { key: ASSIST_KEY }, select: { value: true } })
        .catch(() => null)) as { value: string } | null;

    return row && isAssistMode(row.value) ? row.value : DEFAULT_ASSIST;
}

export async function setAssistMode(mode: AssistMode): Promise<void> {
    const settings = table('appSetting');
    if (!settings) return;

    await settings.upsert({
        where: { key: ASSIST_KEY },
        update: { value: mode },
        create: { key: ASSIST_KEY, value: mode },
    });
}

/**
 * Everything the import pipeline needs, in the order providers get asked.
 *
 * Fails soft, all the way through. A database that will not answer, a column
 * that will not open, a provider name from a future version: each of those
 * removes one key from the list rather than throwing, because the caller's
 * alternative to an AI answer is a rule-based answer, and an import that
 * quietly does the ordinary thing beats an import that 500s.
 */
export async function aiCapability(): Promise<AiCapability> {
    const credentials = table('aiCredential');
    if (!credentials) return { mode: 'off', keys: keysFromEnv() };

    const [mode, rows] = await Promise.all([
        assistMode(),
        credentials
            .findMany({
                where: { enabled: true },
                orderBy: [{ priority: 'asc' }, { provider: 'asc' }],
                select: {
                    provider: true,
                    secret: true,
                    model: true,
                    enabled: true,
                    priority: true,
                    verifiedAt: true,
                },
            })
            .catch(() => []) as Promise<CredentialRow[]>,
    ]);

    const keys: AiKey[] = [];
    const fromRows = new Set<string>();

    for (const row of rows) {
        // Written by a version that knew a provider this one does not.
        if (!(AI_PROVIDERS as readonly string[]).includes(row.provider)) continue;
        fromRows.add(row.provider);

        /*
         * The gate: a key that has never been seen to work is not used.
         *
         * Pasting a key in is not evidence that it works. A key with no credit
         * left, a key for the wrong product, a key with a character missing —
         * all of them sit there looking configured, and the way anybody finds
         * out is a share from a supermarket coming back empty. One press of
         * "test" costs a fraction of a cent and settles it.
         */
        if (row.verifiedAt === null) continue;

        const apiKey = open(row.secret);
        if (!apiKey) continue;

        // A model that would not be safe in a URL never reaches a fetch.
        const model = row.model && isValidModel(row.model) ? row.model : null;

        keys.push({ provider: row.provider as AiProvider, apiKey, model });
    }

    /*
     * The environment fills in providers that have no row of their own — never
     * one that has. A row that exists and will not open is still a decision
     * somebody made about that provider.
     *
     * Environment keys are **not** gated on having been verified, and that is
     * deliberate rather than an oversight: there is no screen on which to
     * verify one, setting an environment variable is already a deliberate
     * deployment act, and a gate nobody can open is a feature that is simply
     * off. The admin screen says where each key comes from, so a deployment
     * using one is not left guessing.
     */
    for (const key of keysFromEnv()) {
        if (!fromRows.has(key.provider)) keys.push(key);
    }

    return { mode, keys };
}

/**
 * One provider's key, for the "test" button.
 *
 * Deliberately ignores `enabled`: testing a key you have just switched off, to
 * work out whether it was the key or something else, is exactly when you press
 * that button.
 */
export async function keyFor(provider: AiProvider): Promise<AiKey | null> {
    const credentials = table('aiCredential');

    const row = credentials
        ? ((await credentials
            .findUnique({ where: { provider }, select: { secret: true, model: true } })
            .catch(() => null)) as { secret: string; model: string | null } | null)
        : null;

    if (row) {
        const apiKey = open(row.secret);
        if (!apiKey) return null;
        return {
            provider,
            apiKey,
            model: row.model && isValidModel(row.model) ? row.model : null,
        };
    }

    return keysFromEnv().find((key) => key.provider === provider) ?? null;
}

interface ViewRow {
    provider: string;
    hint: string;
    secret: string;
    model: string | null;
    enabled: boolean;
    priority: number;
    checkedAt: Date | null;
    checkError: string | null;
    verifiedAt: Date | null;
    autoModelAt: Date | null;
}

/**
 * All three providers, whether configured or not, for the admin screen.
 *
 * All three rather than only the configured ones: a screen that shows what you
 * have tells you nothing about what you could have, and the question being
 * answered here is "what can I set up".
 */
export async function listAiCredentials(): Promise<AiCredentialView[]> {
    const credentials = table('aiCredential');

    const rows: ViewRow[] = credentials
        ? ((await credentials
            .findMany({
            select: {
                provider: true,
                hint: true,
                // Read, never returned: the only thing asked of it is whether
                // it opens, so the screen can say "paste it again" instead of
                // showing a key that silently does nothing.
                secret: true,
                model: true,
                enabled: true,
                priority: true,
                checkedAt: true,
                checkError: true,
                verifiedAt: true,
                autoModelAt: true,
            },
        })
            .catch(() => [])) as ViewRow[])
        : [];

    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    const env = new Set(keysFromEnv().map((key) => key.provider));

    return AI_PROVIDERS.map((provider) => {
        const row = byProvider.get(provider);

        if (row) {
            return {
                provider,
                origin: 'row' as const,
                hint: row.hint,
                model: row.model,
                defaultModel: DEFAULT_MODEL[provider],
                enabled: row.enabled,
                priority: row.priority,
                checkedAt: row.checkedAt ? row.checkedAt.toISOString() : null,
                checkError: row.checkError,
                verified: row.verifiedAt !== null,
                autoModelAt: row.autoModelAt ? row.autoModelAt.toISOString() : null,
                unreadable: open(row.secret) === null,
            };
        }

        return {
            provider,
            origin: env.has(provider) ? ('env' as const) : ('none' as const),
            hint: null,
            model: null,
            defaultModel: DEFAULT_MODEL[provider],
            enabled: env.has(provider),
            priority: 10,
            checkedAt: null,
            checkError: null,
            // An environment key is taken on trust; see `aiCapability`.
            verified: env.has(provider),
            autoModelAt: null,
            unreadable: false,
        };
    });
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

export interface SaveCredential {
    provider: AiProvider;
    /** Omitted when only the model, the switch or the order is changing. */
    apiKey?: string;
    model?: string | null;
    enabled?: boolean;
    priority?: number;
}

/**
 * Writes a provider's settings, sealing the key if one was given.
 *
 * Returns false when there is no key material to seal with, which happens on a
 * deployment with no session secret — one that cannot serve a logged-in page
 * either, so in practice this is a local `next dev` with an empty `.env`. The
 * screen says so rather than storing something it cannot read back.
 */
export async function saveAiCredential(input: SaveCredential): Promise<boolean> {
    const credentials = table('aiCredential');
    if (!credentials) return false;

    if (input.apiKey !== undefined && !canSeal()) return false;

    const model = input.model?.trim() ? input.model.trim() : null;
    if (model && !isValidModel(model)) return false;

    const sealed = input.apiKey !== undefined ? seal(input.apiKey) : undefined;

    /*
     * No key and no row yet — a provider whose key comes from the
     * environment, clicked to make it the first choice. Creating a row here
     * wrote an empty, unverified key that then took the environment's place,
     * and the working key stopped being used.
     */
    if (sealed === undefined) {
        const existing = await credentials.findUnique({ where: { provider: input.provider }, select: { provider: true } });
        if (!existing) return false;
    }

    await credentials.upsert({
        where: { provider: input.provider },
        update: {
            ...(sealed !== undefined
                ? {
                    secret: sealed,
                    hint: hintFor(input.apiKey as string),
                    // A new key makes every previous verdict about this
                    // provider meaningless, so it goes rather than lingering
                    // as a red line under a key nobody has tested yet — and
                    // the new key starts unverified, which means unused, until
                    // somebody presses test.
                    checkedAt: null,
                    checkError: null,
                    verifiedAt: null,
                }
                : {}),
            // Typing a model in is a decision, so it stops being automatic.
            ...(input.model !== undefined ? { model, autoModelAt: null } : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
        create: {
            provider: input.provider,
            // An upsert with no key on a provider that has no row would create
            // one with nothing in it. The caller is stopped before here; this
            // is the belt to that brace.
            secret: sealed ?? seal(''),
            hint: input.apiKey !== undefined ? hintFor(input.apiKey) : '',
            model,
            enabled: input.enabled ?? true,
            priority: input.priority ?? 10,
        },
    });

    return true;
}

/**
 * Makes one provider the first one asked.
 *
 * Every provider, not only the ones with rows, so that "primary" survives a key
 * being deleted and re-added. One statement each, in a transaction, because the
 * half-applied version of this is two primaries.
 */
export async function setPrimary(provider: AiProvider): Promise<void> {
    if (!table('aiCredential')) return;

    /*
     * The callback form, not the array form, and the reason is worth writing
     * down because it cost a red deploy.
     *
     * `$transaction([...])` takes `PrismaPromise[]` — Prisma's own promise
     * type, which carries the hidden handle the batch is assembled from. The
     * delegates here come through `table()`, a hand-written interface that
     * exists precisely because the generated client may not know this model
     * yet, and it can only promise `Promise<unknown>`. The two are not the
     * same type and the array form rejects ours.
     *
     * It compiled locally anyway. Without a generated client, `prisma` is
     * loosely typed and `$transaction` accepts anything; the error only
     * appeared on a machine that had run `prisma generate`. So this is a whole
     * class of mistake the local type-check cannot see, and the only honest
     * answer is to prefer the form that does not depend on Prisma's own
     * promise type at all.
     *
     * `tx` is used rather than the outer delegates: statements issued on the
     * outer client inside this callback would run outside the transaction,
     * which would look identical and be exactly the bug this guards against.
     */
    await prisma.$transaction(async (tx: unknown) => {
        const inside = transactionTable<Delegate>(tx, 'aiCredential');
        if (!inside) return;

        await inside.updateMany({ where: {}, data: { priority: 10 } });
        await inside.updateMany({ where: { provider }, data: { priority: 0 } });
    });
}

/**
 * Records what the test said.
 *
 * `verifiedAt` moves forward on a success and is *never* cleared here. That
 * asymmetry is the whole design: the failure this was built for was a Gemini
 * 503 saying "spikes in demand are usually temporary", and a gate that closes
 * on a transient error is a gate somebody has to remember to re-open. Once a
 * key has been seen to work, it has been seen to work; a later failure shows
 * as a warning next to it and does not take the feature away.
 */
export async function recordCheck(provider: AiProvider, error: string | null): Promise<void> {
    const credentials = table('aiCredential');
    if (!credentials) return;

    await credentials
        .updateMany({
            where: { provider },
            data: {
                checkedAt: new Date(),
                checkError: error,
                ...(error === null ? { verifiedAt: new Date() } : {}),
            },
        })
        .catch(() => undefined);
}

/**
 * Writes down which model actually answered.
 *
 * Only when the field was left empty — that is, when the deployment is on
 * "whatever the default is". Somebody who typed a model name in made a
 * decision, and this may carry on past it for one request but must not quietly
 * rewrite it; the next person to look at that screen should see what they
 * chose, not what a fallback picked at three in the morning.
 *
 * Fire and forget. It is a side effect on a read path — an import is in
 * progress and somebody is waiting — so a failure here changes nothing about
 * the recipe that is being read.
 */
export async function rememberModel(provider: AiProvider, model: string): Promise<void> {
    const credentials = table('aiCredential');
    if (!credentials || !isValidModel(model)) return;
    // The default answering is not news: writing it down would pin today's
    // default for good, past the day the default moves on.
    if (model === DEFAULT_MODEL[provider]) return;

    await credentials
        .updateMany({
            // The `model: null` in the filter is the whole rule: an explicit
            // choice is never overwritten, and there is no read-then-write
            // between the two halves for anything to race in.
            where: { provider, model: null },
            data: { model, autoModelAt: new Date() },
        })
        .catch(() => undefined);
}

export async function deleteAiCredential(provider: AiProvider): Promise<void> {
    const credentials = table('aiCredential');
    if (!credentials) return;

    await credentials.deleteMany({ where: { provider } });
}
