'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';

interface CaptureTokenRow {
    id: number;
    label: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
}

/**
 * Devices allowed to post to the inbox, and how to set one up.
 *
 * The setup instructions live here rather than in the README because this is
 * where the token is, and the token is only ever shown once — sending someone
 * to a separate document at exactly the moment they are holding a secret they
 * cannot get back is how secrets end up in note-taking apps.
 */
export default function AdminDevicesPage() {
    const t = useTranslations('Devices');
    const tAdmin = useTranslations('Admin');

    const [tokens, setTokens] = useState<CaptureTokenRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [label, setLabel] = useState('');
    const [creating, setCreating] = useState(false);
    const [secret, setSecret] = useState('');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/capture-tokens');
            if (!res.ok) throw new Error(tAdmin('genericError'));
            const data = await res.json();
            setTokens(data.tokens);
        } catch (err) {
            setError(err instanceof Error ? err.message : tAdmin('genericError'));
        } finally {
            setLoading(false);
        }
    }, [tAdmin]);

    useEffect(() => {
        load();
    }, [load]);

    const create = async () => {
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/capture-tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: label.trim() || t('defaultLabel') }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.message || tAdmin('genericError'));
                return;
            }
            setSecret(data.secret);
            setLabel('');
            await load();
        } catch {
            setError(tAdmin('genericError'));
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (id: number) => {
        try {
            const res = await fetch(`/api/capture-tokens/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                setError(tAdmin('genericError'));
                return;
            }
            await load();
        } catch {
            setError(tAdmin('genericError'));
        }
    };

    const endpoint =
        typeof window === 'undefined' ? '/api/capture' : `${window.location.origin}/api/capture`;

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 pt-10 sm:px-8">
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-6">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                <Link href="/admin/inbox" className="text-sm underline underline-offset-4">
                    {t('backToInbox')}
                </Link>
            </div>

            <p className="mb-8 font-serif text-muted">{t('explanation')}</p>

            {error && (
                <p className="mb-6 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            <div className="mb-10 flex flex-wrap gap-3">
                <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder={t('labelPlaceholder')}
                    className="min-w-0 flex-1 rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink"
                />
                <button
                    type="button"
                    onClick={create}
                    disabled={creating}
                    className="rounded-full bg-ink px-5 py-2 font-medium text-page disabled:opacity-50"
                >
                    {creating ? t('creating') : t('create')}
                </button>
            </div>

            {secret && (
                <div className="mb-10 rounded-lg border border-line p-4">
                    <p className="text-sm font-bold">{t('secretHeading')}</p>
                    <p className="mt-1 text-sm text-muted">{t('secretWarning')}</p>
                    <code className="mt-3 block overflow-x-auto rounded bg-surface px-3 py-2 font-mono text-sm">
                        {secret}
                    </code>
                    <button
                        type="button"
                        onClick={async () => {
                            await navigator.clipboard.writeText(secret);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 2000);
                        }}
                        className="mt-3 text-sm underline underline-offset-4"
                    >
                        {copied ? t('copied') : t('copy')}
                    </button>
                </div>
            )}

            <h2 className="mb-4 text-xs uppercase tracking-widest text-faint">{t('devicesHeading')}</h2>

            {loading ? (
                <p className="text-muted">{t('loading')}</p>
            ) : tokens.length === 0 ? (
                <p className="py-8 text-muted">{t('noDevices')}</p>
            ) : (
                <ul className="mb-12 flex flex-col divide-y divide-line">
                    {tokens.map((token) => (
                        <li key={token.id} className="flex items-center justify-between gap-4 py-3">
                            <div className="min-w-0">
                                <p className={token.revokedAt ? 'text-faint line-through' : 'font-medium'}>
                                    {token.label}
                                </p>
                                <p className="text-sm text-faint">
                                    {token.lastUsedAt
                                        ? t('lastUsed', {
                                            date: new Date(token.lastUsedAt).toLocaleDateString(),
                                        })
                                        : t('neverUsed')}
                                </p>
                            </div>
                            {!token.revokedAt && (
                                <span className="shrink-0">
                                    <InlineConfirm
                                        label={t('revoke')}
                                        confirmLabel={t('revoke')}
                                        destructive
                                        onConfirm={() => revoke(token.id)}
                                        className="text-sm text-faint underline underline-offset-4 hover:text-danger"
                                    />
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <section className="border-t border-line pt-8">
                <h2 className="mb-2 text-xl font-bold">{t('shortcutHeading')}</h2>
                <p className="mb-6 font-serif text-muted">{t('shortcutIntro')}</p>

                <ol className="flex list-decimal flex-col gap-4 pl-5 marker:text-faint">
                    <li>{t('step1')}</li>
                    <li>{t('step2')}</li>
                    <li>
                        {t('step3')}
                        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line p-4 text-sm">
                            <dt className="text-faint">URL</dt>
                            <dd className="break-all font-mono">{endpoint}</dd>
                            <dt className="text-faint">{t('method')}</dt>
                            <dd className="font-mono">POST</dd>
                            <dt className="text-faint">{t('header')}</dt>
                            <dd className="font-mono">Authorization</dd>
                            <dt className="text-faint">{t('headerValue')}</dt>
                            <dd className="font-mono">{t('yourToken')}</dd>
                            <dt className="text-faint">{t('body')}</dt>
                            <dd className="font-mono">JSON</dd>
                            <dt className="text-faint">{t('field')}</dt>
                            <dd className="font-mono">text &rarr; {t('shortcutInput')}</dd>
                        </dl>
                    </li>
                    <li>{t('step4')}</li>
                    <li>{t('step5')}</li>
                </ol>

                <p className="mt-6 text-sm text-muted">{t('shortcutNote')}</p>

                {/* A second Shortcut, because a screenshot is how most people
                    actually save a recipe on a phone — one button, and it works
                    on an app that refuses to be read any other way. */}
                <h3 className="mt-10 text-base font-bold tracking-tight">{t('screenshotHeading')}</h3>
                <p className="mt-2 text-sm leading-relaxed">{t('screenshotIntro')}</p>

                <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed">
                    <li>{t('screenshotStep1')}</li>
                    <li>{t('screenshotStep2')}</li>
                    <li>
                        {t('screenshotStep3')}
                        <pre className="mt-2 overflow-x-auto rounded border border-line p-3 font-mono text-xs">
{`{ "image": { "base64": <Base64>, "mediaType": "image/png" } }`}
                        </pre>
                    </li>
                    <li>{t('screenshotStep4')}</li>
                </ol>

                <p className="mt-4 text-sm text-muted">{t('screenshotNote')}</p>
            </section>

        </main>
    );
}
