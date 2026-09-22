'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall, chip } from '@/lib/ui';

/**
 * Where the AI keys are set.
 *
 * The screen is built around one admission: a key that is stored is not the
 * same thing as a key that works, and every way of finding out which you have
 * used to involve importing a recipe and watching what happened. So each
 * provider carries a **Test** button that does a real extraction, and the
 * result is kept — "checked on the 3rd, worked" is worth more on a screen than
 * any number of green ticks meaning "a string is present".
 *
 * The key field is **write-only**. It is never filled in, never shown back,
 * never sent to the browser — the row says `•••• 4f2a` and that is the whole
 * of what a person needs in order to know which key they are looking at. An
 * edit form that cannot display a secret is an edit form that cannot leak one.
 */

type Origin = 'row' | 'env' | 'none';

interface Credential {
    provider: 'anthropic' | 'openai' | 'google';
    origin: Origin;
    hint: string | null;
    model: string | null;
    defaultModel: string;
    enabled: boolean;
    priority: number;
    checkedAt: string | null;
    checkError: string | null;
    unreadable: boolean;
}

interface TestResult {
    ok: boolean;
    message?: string;
    title?: string;
    ingredients?: number;
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

    /** Typed but not yet saved, per provider. Never read back from the server. */
    const [drafts, setDrafts] = useState<Record<string, { key: string; model: string }>>({});
    const [busy, setBusy] = useState('');
    const [tests, setTests] = useState<Record<string, TestResult>>({});

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/ai-keys');
            if (!res.ok) throw new Error(tAdmin('genericError'));
            const data = await res.json();
            setCredentials(data.credentials);
            setMode(data.mode);
            setCanStore(data.canStore);
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        } finally {
            setLoading(false);
        }
    }, [tAdmin]);

    useEffect(() => {
        load();
    }, [load]);

    const draftFor = (provider: string) => drafts[provider] ?? { key: '', model: '' };

    const setDraft = (provider: string, patch: Partial<{ key: string; model: string }>) =>
        setDrafts((current) => ({
            ...current,
            [provider]: { ...draftFor(provider), ...patch },
        }));

    const save = async (provider: string, extra: Record<string, unknown> = {}) => {
        setBusy(provider);
        setError('');

        const draft = draftFor(provider);
        const credential = credentials.find((entry) => entry.provider === provider);

        try {
            const res = await fetch('/api/ai-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider,
                    ...(draft.key.trim() ? { apiKey: draft.key.trim() } : {}),
                    // An empty box means the provider's default, which is a
                    // real choice and has to be storable — so null rather than
                    // "leave whatever was there".
                    ...(draft.model !== (credential?.model ?? '')
                        ? { model: draft.model.trim() || null }
                        : {}),
                    ...extra,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.message || tAdmin('genericError'));
                return;
            }

            setCredentials(data.credentials);
            // The typed key goes the moment it is stored. Leaving it in a
            // React state that survives a re-render is leaving a key in the
            // page for as long as the tab is open.
            setDrafts((current) => ({ ...current, [provider]: { key: '', model: draft.model } }));
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusy('');
        }
    };

    const test = async (provider: string) => {
        setBusy(provider);
        setError('');
        setTests((current) => ({ ...current, [provider]: { ok: false, message: t('testing') } }));

        try {
            const res = await fetch(`/api/ai-keys/${provider}/test`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setTests((current) => ({
                    ...current,
                    [provider]: { ok: false, message: data.message || tAdmin('genericError') },
                }));
                return;
            }

            setTests((current) => ({ ...current, [provider]: data }));
            if (data.credentials) setCredentials(data.credentials);
        } catch {
            setTests((current) => ({
                ...current,
                [provider]: { ok: false, message: tAdmin('genericError') },
            }));
        } finally {
            setBusy('');
        }
    };

    const remove = async (provider: string) => {
        setBusy(provider);
        try {
            const res = await fetch(`/api/ai-keys/${provider}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.credentials) setCredentials(data.credentials);
            setTests((current) => ({ ...current, [provider]: { ok: false, message: '' } }));
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setBusy('');
        }
    };

    const changeMode = async (next: string) => {
        setMode(next);
        await fetch('/api/ai-keys', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: next }),
        }).catch(() => undefined);
    };

    if (loading) return <p className="text-muted">{t('loading')}</p>;

    const configured = credentials.some((entry) => entry.origin !== 'none');

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
                thing costing me money", and somebody arriving worried about
                that should not have to read three provider cards to find it. */}
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

                {mode !== 'off' && !configured && (
                    <p className="mt-3 text-sm text-faint">{t('noKeysYet')}</p>
                )}
            </section>

            <h2 className="mb-1 text-xs uppercase tracking-widest text-faint">
                {t('providersHeading')}
            </h2>
            <p className="mb-6 text-sm text-muted">{t('providersIntro')}</p>

            <ul className="flex flex-col gap-4">
                {credentials.map((credential) => {
                    const draft = draftFor(credential.provider);
                    const result = tests[credential.provider];
                    const working = busy === credential.provider;

                    return (
                        <li
                            key={credential.provider}
                            className="rounded-lg border border-line p-4"
                        >
                            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="font-bold">{t(`provider_${credential.provider}`)}</h3>

                                <p className="text-sm text-faint">
                                    {credential.origin === 'row' && credential.hint
                                        ? `•••• ${credential.hint}`
                                        : credential.origin === 'env'
                                            ? t('fromEnvironment')
                                            : t('notSetUp')}
                                </p>
                            </div>

                            {credential.unreadable && (
                                <p className="mb-3 rounded border border-danger-line bg-danger-surface p-2 text-sm text-danger">
                                    {t('unreadable')}
                                </p>
                            )}

                            {credential.origin === 'env' ? (
                                <p className="mb-3 text-sm text-muted">{t('environmentNote')}</p>
                            ) : (
                                <label className="mb-3 block">
                                    <span className="mb-1 block text-sm text-muted">
                                        {credential.origin === 'row' ? t('replaceKey') : t('newKey')}
                                    </span>
                                    <input
                                        type="password"
                                        value={draft.key}
                                        onChange={(event) =>
                                            setDraft(credential.provider, { key: event.target.value })
                                        }
                                        placeholder={t(`placeholder_${credential.provider}`)}
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="w-full rounded-lg border border-control bg-transparent px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-ink"
                                    />
                                </label>
                            )}

                            <label className="mb-3 block">
                                <span className="mb-1 block text-sm text-muted">{t('model')}</span>
                                <input
                                    type="text"
                                    value={draft.model || credential.model || ''}
                                    onChange={(event) =>
                                        setDraft(credential.provider, { model: event.target.value })
                                    }
                                    placeholder={credential.defaultModel}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="w-full rounded-lg border border-control bg-transparent px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-ink"
                                />
                            </label>

                            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="primary"
                                        checked={credential.priority === 0}
                                        onChange={() => save(credential.provider, { primary: true })}
                                        disabled={credential.origin === 'none'}
                                    />
                                    {t('primary')}
                                </label>

                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={credential.enabled}
                                        onChange={(event) =>
                                            save(credential.provider, { enabled: event.target.checked })
                                        }
                                        disabled={credential.origin !== 'row'}
                                    />
                                    {t('enabled')}
                                </label>
                            </div>

                            <div className="flex flex-wrap items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => save(credential.provider)}
                                    disabled={working || (!draft.key.trim() && draft.model === '')}
                                    className={buttonPrimarySmall}
                                >
                                    {working ? t('saving') : t('save')}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => test(credential.provider)}
                                    disabled={working || credential.origin === 'none'}
                                    className="text-sm underline underline-offset-4 disabled:text-faint disabled:no-underline"
                                >
                                    {t('test')}
                                </button>

                                {credential.origin === 'row' && (
                                    <InlineConfirm
                                        label={t('remove')}
                                        confirmLabel={t('remove')}
                                        destructive
                                        onConfirm={() => remove(credential.provider)}
                                        className="text-sm text-faint underline underline-offset-4 hover:text-danger"
                                    />
                                )}
                            </div>

                            {/* The freshest verdict wins: a test just pressed
                                says more than the one stored last week. */}
                            {result?.message ? (
                                <p
                                    className={`mt-3 text-sm ${result.ok ? 'text-muted' : 'text-danger'}`}
                                >
                                    {result.message}
                                </p>
                            ) : result?.ok ? (
                                <p className="mt-3 text-sm text-muted">
                                    {t('testOk', {
                                        title: result.title ?? '',
                                        count: result.ingredients ?? 0,
                                    })}
                                </p>
                            ) : credential.checkedAt ? (
                                <p
                                    className={`mt-3 text-sm ${credential.checkError ? 'text-danger' : 'text-faint'}`}
                                >
                                    {credential.checkError
                                        ? t('lastCheckFailed', {
                                            date: formatDate(credential.checkedAt, locale, 'short'),
                                            message: credential.checkError,
                                        })
                                        : t('lastCheckOk', {
                                            date: formatDate(credential.checkedAt, locale, 'short'),
                                        })}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>

            <p className="mt-8 text-sm text-muted">{t('privacyNote')}</p>
        </>
    );
}
