'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { formatDate } from '@/lib/formatDate';
import { messageFrom, sayable } from '@/lib/apiMessage';
import { buttonPrimarySmall, chip } from '@/lib/ui';
import Loading from '@/components/ui/Loading';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * Where the AI keys are set.
 *
 * This was three cards, one per provider, stacked — identical in every respect
 * except the word at the top and the shape of the key. Which is what the *data*
 * looks like and not what the job looks like: nobody holds three AI accounts
 * for a recipe website. One is the case; a second exists so that a provider
 * having a bad afternoon is not the cookbook having one.
 *
 * So there is one card, and a menu above it saying whose. Choosing a provider
 * is the same act as deciding to use it — there is no separate "make this the
 * one", because a screen with a chooser *and* a primary radio is a screen that
 * has to explain the difference between them.
 *
 * A provider whose key is kept but which is not chosen stays as a fallback,
 * asked only when the chosen one fails. That is said in one line under the
 * card rather than being a control, because it is a consequence of what is
 * stored rather than a decision anybody makes.
 *
 * The key field is **write-only**. It is never filled in, never shown back,
 * never sent to the browser — the menu says `•••• 4f2a` and that is the whole
 * of what a person needs to know which key they are looking at. An edit form
 * that cannot display a secret is an edit form that cannot leak one.
 */

type Provider = 'anthropic' | 'openai' | 'google';

interface Credential {
    provider: Provider;
    origin: 'row' | 'env' | 'none';
    hint: string | null;
    model: string | null;
    defaultModel: string;
    enabled: boolean;
    priority: number;
    checkedAt: string | null;
    checkError: string | null;
    verified: boolean;
    autoModelAt: string | null;
    unreadable: boolean;
}

interface TestResult {
    ok: boolean;
    message?: string;
    title?: string;
    ingredients?: number;
    /** Which model actually answered — not always the one that was asked. */
    model?: string | null;
}

export default function AiKeys() {
    const t = useTranslations('Ai');
    const tAdmin = useTranslations('Admin');
    const locale = useLocale();

    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [mode, setMode] = useState<string>('always');
    const [canStore, setCanStore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    /** Which provider the card is showing. */
    const [chosen, setChosen] = useState<Provider>('anthropic');
    const [keyDraft, setKeyDraft] = useState('');
    const [modelDraft, setModelDraft] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [test, setTest] = useState<TestResult | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/ai-keys');
            if (!res.ok) throw new Error(tAdmin('genericError'));
            const data = await res.json();

            setCredentials(data.credentials);
            setMode(data.mode);
            setCanStore(data.canStore);

            // Open on whichever is actually in use, rather than on the first in
            // the list — the screen is nearly always visited to look at that one.
            const inUse = (data.credentials as Credential[])
                .filter((entry) => entry.origin !== 'none')
                .sort((a, b) => a.priority - b.priority)[0];

            if (inUse) setChosen(inUse.provider);
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        } finally {
            setLoading(false);
        }
    }, [tAdmin]);

    useEffect(() => {
        load();
    }, [load]);

    const current = credentials.find((entry) => entry.provider === chosen);

    /** The model box shows the stored value until somebody types in it. */
    const modelValue = modelDraft ?? current?.model ?? '';

    const choose = async (provider: Provider) => {
        setChosen(provider);
        setKeyDraft('');
        setModelDraft(null);
        setTest(null);
        setError('');

        // Choosing one that is already set up is choosing to use it. One with
        // no key yet is only being looked at, and becomes the used one when a
        // key is saved.
        const target = credentials.find((entry) => entry.provider === provider);
        // A key from the environment has no row to reorder; saving one
        // created an empty key that replaced it.
        if (!target || target.origin !== 'row' || target.priority === 0) return;

        await save(provider, { primary: true }, '');
    };

    const save = async (
        provider: Provider,
        extra: Record<string, unknown> = {},
        apiKey = keyDraft
    ) => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch('/api/ai-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider,
                    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                    ...(modelDraft !== null ? { model: modelDraft.trim() || null } : {}),
                    // Saving a key is choosing that provider. Anything else
                    // would be a screen where you paste a key and nothing uses it.
                    ...(apiKey.trim() ? { primary: true } : {}),
                    ...extra,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(sayable(data?.message, tAdmin('genericError')));
                return;
            }

            setCredentials(data.credentials);
            // The typed key goes the moment it is stored. Leaving it in a state
            // that survives a re-render leaves a key in the page for as long as
            // the tab is open.
            setKeyDraft('');
            setModelDraft(null);
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusy(false);
        }
    };

    const runTest = async () => {
        setBusy(true);
        setError('');
        setTest({ ok: false, message: t('testing') });

        try {
            const res = await fetch(`/api/ai-keys/${chosen}/test`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setTest({ ok: false, message: sayable(data?.message, tAdmin('genericError')) });
                return;
            }

            setTest(data);
            if (data.credentials) setCredentials(data.credentials);
        } catch {
            setTest({ ok: false, message: tAdmin('genericError') });
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/ai-keys/${chosen}`, { method: 'DELETE' });
            // A refused delete used to produce nothing at all: the panel did
            // not change, which is also what a successful delete of the last
            // key looks like.
            if (!res.ok) {
                setError(await messageFrom(res, tAdmin('genericError')));
                return;
            }
            const data = await res.json().catch(() => ({}));
            if (data.credentials) setCredentials(data.credentials);
            setTest(null);
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusy(false);
        }
    };

    /*
     * The chip moves first, because a switch that waits for the network feels
     * broken. That optimism is only honest if it is undone when the save
     * fails — and it was not: the response was never looked at, so a mode that
     * had not been saved looked exactly like one that had, until the next page
     * load put it back.
     */
    const changeMode = async (next: string) => {
        const previous = mode;
        setMode(next);
        setError('');

        try {
            const res = await fetch('/api/ai-keys', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: next }),
            });
            if (!res.ok) {
                setMode(previous);
                setError(await messageFrom(res, tAdmin('genericError')));
            }
        } catch {
            setMode(previous);
            setError(tAdmin('genericError'));
        }
    };

    if (loading) return <Loading label={t('loading')} />;

    // "Configured" for the menu, "usable" for the sentence about what runs:
    // an untested key is set up and is not being used, and saying otherwise
    // would be the screen telling a comfortable lie.
    const configured = credentials.filter((entry) => entry.origin !== 'none');
    const usable = configured.filter((entry) => entry.verified && !entry.unreadable);
    const inUse = [...usable].sort((a, b) => a.priority - b.priority)[0];
    const fallbacks = usable.filter((entry) => entry.provider !== inUse?.provider);

    return (
        <>
            {error && (
                <p className="mb-6 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {!canStore && (
                <p className="mb-6 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {t('cannotStore')}
                </p>
            )}

            {/* The setting first, because it is the one that answers "is this
                costing me money", and somebody arriving worried about that
                should not have to read a provider card to find it. */}
            <section className="mb-10">
                <h2 className="mb-1 text-xs uppercase tracking-widest text-faint">
                    {t('modeHeading')}
                </h2>
                <p className="mb-4 text-sm text-muted">{t('modeIntro')}</p>

                <div className="flex flex-wrap gap-2">
                    {(['off', 'images', 'always'] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => changeMode(option)}
                            aria-pressed={mode === option}
                            className={chip(mode === option)}
                        >
                            {t(`mode_${option}`)}
                        </button>
                    ))}
                </div>

                <p className="mt-3 text-sm text-muted">{t(`modeHelp_${mode}`)}</p>

                {mode !== 'off' && configured.length === 0 && (
                    <p className="mt-3 text-sm text-faint">{t('noKeysYet')}</p>
                )}
            </section>

            <h2 className="mb-1 text-xs uppercase tracking-widest text-faint">
                {t('providersHeading')}
            </h2>
            <p className="mb-4 text-sm text-muted">{t('providersIntro')}</p>

            <label className="mb-4 block">
                <span className="mb-1 block text-sm text-muted">{t('providerLabel')}</span>
                <select
                    value={chosen}
                    onChange={(event) => choose(event.target.value as Provider)}
                    disabled={busy}
                    className="w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink"
                >
                    {credentials.map((entry) => (
                        <option key={entry.provider} value={entry.provider}>
                            {t(`provider_${entry.provider}`)}
                            {entry.origin === 'row' && entry.hint
                                ? ` — •••• ${entry.hint}`
                                : entry.origin === 'env'
                                    ? ` — ${t('fromEnvironment')}`
                                    : ''}
                        </option>
                    ))}
                </select>
            </label>

            {current && (
                <div className="rounded-lg border border-line p-4">
                    {/*
                        The gate, said before anything else on the card.

                        A key that has never been seen to work is not used —
                        and the failure it prevents is the quiet one: a key
                        with no credit, or one character short, sits there
                        looking configured while every share comes back as if
                        no key existed at all.
                    */}
                    {current.origin === 'row' && !current.verified && (
                        <p className="mb-3 rounded border border-line bg-surface p-2 text-sm">
                            {t('notVerified')}
                        </p>
                    )}

                    {current.unreadable && (
                        <p className="mb-3 rounded border border-danger-line bg-danger-surface p-2 text-sm text-danger">
                            {t('unreadable')}
                        </p>
                    )}

                    {current.origin === 'env' ? (
                        <p className="mb-3 text-sm text-muted">{t('environmentNote')}</p>
                    ) : (
                        <label className="mb-3 block">
                            <span className="mb-1 block text-sm text-muted">
                                {current.origin === 'row' ? t('replaceKey') : t('newKey')}
                            </span>
                            <input
                                type="password"
                                value={keyDraft}
                                onChange={(event) => setKeyDraft(event.target.value)}
                                placeholder={t(`placeholder_${current.provider}`)}
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full rounded-lg border border-control bg-transparent px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-ink"
                            />
                        </label>
                    )}

                    <label className="mb-1 block">
                        <span className="mb-1 block text-sm text-muted">{t('model')}</span>
                        <input
                            type="text"
                            value={modelValue}
                            onChange={(event) => setModelDraft(event.target.value)}
                            placeholder={current.defaultModel}
                            autoComplete="off"
                            spellCheck={false}
                            className="w-full rounded-lg border border-control bg-transparent px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-ink"
                        />
                    </label>

                    {/* A model that changed itself is exactly the kind of
                        thing that must never be a surprise — and the reason it
                        changed is worth knowing, because it means the one you
                        had ran out. */}
                    <p className="mb-4 text-sm text-muted">
                        {current.autoModelAt
                            ? t('modelAuto', {
                                date: formatDate(current.autoModelAt, locale, 'short'),
                            })
                            : t('modelHint')}
                    </p>

                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            type="button"
                            onClick={() => save(chosen)}
                            disabled={busy || (!keyDraft.trim() && modelDraft === null)}
                            className={buttonPrimarySmall}
                        >
                            <BusyLabel busy={busy} busyText={t('saving')}>{t('save')}</BusyLabel>
                        </button>

                        <button
                            type="button"
                            onClick={runTest}
                            disabled={busy || current.origin === 'none'}
                            className="text-sm underline underline-offset-4 disabled:text-faint disabled:no-underline"
                        >
                            {t('test')}
                        </button>

                        {current.origin === 'row' && (
                            <InlineConfirm
                                label={t('remove')}
                                confirmLabel={t('remove')}
                                destructive
                                onConfirm={remove}
                                className="text-sm text-faint underline underline-offset-4 hover:text-danger"
                            />
                        )}
                    </div>

                    {/* A test just pressed says more than one stored last week. */}
                    {test?.message ? (
                        <p className={`mt-3 text-sm ${test.ok ? 'text-muted' : 'text-danger'}`}>
                            {test.message}
                        </p>
                    ) : test?.ok ? (
                        <p className="mt-3 text-sm text-muted">
                            {t('testOk', {
                                title: test.title ?? '',
                                count: test.ingredients ?? 0,
                            })}
                            {test.model ? ` ${t('testModel', { model: test.model })}` : ''}
                        </p>
                    ) : current.checkedAt ? (
                        <p
                            className={`mt-3 text-sm ${current.checkError ? 'text-danger' : 'text-faint'}`}
                        >
                            {current.checkError
                                ? t('lastCheckFailed', {
                                    date: formatDate(current.checkedAt, locale, 'short'),
                                    message: current.checkError,
                                })
                                : t('lastCheckOk', {
                                    date: formatDate(current.checkedAt, locale, 'short'),
                                })}
                        </p>
                    ) : null}
                </div>
            )}

            {/* What is actually in effect, in a sentence. The menu above says
                what you are looking at; this says what runs. */}
            {!inUse && configured.length > 0 && (
                <p className="mt-4 text-sm text-muted">{t('noneUsable')}</p>
            )}

            {inUse && (
                <p className="mt-4 text-sm text-muted">
                    {fallbacks.length > 0
                        ? t('inUseWithFallback', {
                            provider: t(`provider_${inUse.provider}`),
                            fallback: fallbacks
                                .map((entry) => t(`provider_${entry.provider}`))
                                .join(', '),
                        })
                        : t('inUse', { provider: t(`provider_${inUse.provider}`) })}
                </p>
            )}

            <p className="mt-8 text-sm text-muted">{t('privacyNote')}</p>
        </>
    );
}
