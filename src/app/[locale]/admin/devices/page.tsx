'use client';

import { useCallback, useEffect, useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useLocale, useTranslations } from 'next-intl';
import InlineConfirm from '@/components/ui/InlineConfirm';
import Disclosure from '@/components/ui/Disclosure';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall, pageContainer } from '@/lib/ui';
import PageHeader from '@/components/admin/PageHeader';

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
    // The site's language, not the browser's: these three pages used
    // toLocaleDateString() with no argument, so a German reader on an
    // English-language phone saw 9/21/2026 here and 21. September 2026
    // on the blog, in one visit.
    const locale = useLocale();

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
                setError(sayable(data?.message, tAdmin('genericError')));
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

    // Read after hydration: on the server there is no address to read, and
    // a different first render in the browser is a hydration error.
    const [origin, setOrigin] = useState('');
    useEffect(() => setOrigin(window.location.origin), []);
    const endpoint = `${origin}/api/capture`;

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('title')} intro={t('explanation')} />

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
                    // A placeholder is not a label: it vanishes the moment
                    // somebody types, taking the only explanation with it.
                    aria-label={t('labelPlaceholder')}
                    className="min-w-0 flex-1 rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink"
                />
                <button
                    type="button"
                    onClick={create}
                    disabled={creating}
                    className={buttonPrimarySmall}
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
                                            date: formatDate(token.lastUsedAt, locale, 'short'),
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
                <h2 className="mb-2 text-xl font-bold">{t('setupHeading')}</h2>
                <p className="mb-6 font-serif text-muted">{t('setupIntro')}</p>

                {/*
                    Folded away, because this page has two jobs with very
                    different frequencies. Revoking a key is something you do
                    when a phone goes missing; building the shortcut is
                    something you do once, and then never read again. Five
                    hundred words of iOS instructions permanently unrolled
                    under the list turns the common visit into a scroll.
                */}
                <div className="rounded-lg border border-line px-4">
                    <Disclosure title={t('sc1Title')} subtitle={t('sc1Intro')}>
                        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed marker:text-faint">
                            <li>{t('sc1Step1')}</li>
                            <li>
                                {t('sc1Step2')}
                                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line p-3">
                                    <dt className="text-faint">URL</dt>
                                    <dd className="break-all font-mono">{endpoint}</dd>
                                    <dt className="text-faint">{t('method')}</dt>
                                    <dd className="font-mono">POST</dd>
                                    <dt className="text-faint">{t('header')}</dt>
                                    <dd className="font-mono">Authorization</dd>
                                    <dt className="text-faint">{t('headerValue')}</dt>
                                    <dd className="font-mono">Bearer {t('yourToken')}</dd>
                                    <dt className="text-faint">{t('body')}</dt>
                                    <dd className="font-mono">JSON</dd>
                                    <dt className="text-faint">{t('field')}</dt>
                                    <dd className="font-mono">url &rarr; {t('shortcutInput')}</dd>
                                </dl>
                            </li>
                            <li>{t('sc1Step3')}</li>
                            <li>{t('sc1Step4')}</li>
                            <li>{t('sc1Step5')}</li>
                        </ol>
                        <p className="mt-4 text-sm text-muted">{t('queuedNote')}</p>

                        <h3 className="mt-6 text-sm font-bold">{t('sc1ShotsTitle')}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{t('sc1ShotsIntro')}</p>
                        <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed marker:text-faint">
                            <li>{t('sc1Shots1')}</li>
                            <li>{t('sc1Shots2')}</li>
                            <li>{t('sc1Shots3')}</li>
                            <li>{t('sc1Shots4')}</li>
                            <li>{t('sc1Shots5')}</li>
                            <li>
                                {t('sc1Shots6')}
                                <pre className="mt-2 overflow-x-auto rounded border border-line p-3 font-mono text-xs">
{`{ "url": <Shortcut Input>, "images": <Combined Text> }`}
                                </pre>
                            </li>
                            <li>{t('sc1Shots7')}</li>
                        </ol>
                        <p className="mt-4 text-sm text-muted">{t('sc1ShotsNote')}</p>
                    </Disclosure>

                    <Disclosure title={t('sc2Title')} subtitle={t('sc2Intro')}>
                        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed marker:text-faint">
                            <li>{t('sc2Step1')}</li>
                            <li>{t('sc2Step2')}</li>
                            <li>{t('sc2Step3')}</li>
                            <li>
                                {t('sc2Step4')}
                                <pre className="mt-2 overflow-x-auto rounded border border-line p-3 font-mono text-xs">
{`{ "image": { "base64": <Base64 Encoded>, "mediaType": "image/jpeg" } }`}
                                </pre>
                            </li>
                            <li>{t('sc2Step5')}</li>
                        </ol>
                        <p className="mt-4 text-sm text-muted">{t('sc2Note')}</p>

                        <h3 className="mt-6 text-sm font-bold">{t('sc2LinkTitle')}</h3>
                        <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed marker:text-faint">
                            <li>{t('sc2Link1')}</li>
                            <li>{t('sc2Link2')}</li>
                            <li>
                                {t('sc2Link3')}
                                <pre className="mt-2 overflow-x-auto rounded border border-line p-3 font-mono text-xs">
{`{ "url": <Clipboard>, "image": { "base64": <Base64 Encoded>, "mediaType": "image/jpeg" } }`}
                                </pre>
                            </li>
                        </ol>
                        <p className="mt-4 text-sm text-muted">{t('sc2LinkNote')}</p>
                    </Disclosure>

                    <Disclosure title={t('sc3Title')} subtitle={t('sc3Intro')}>
                        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed marker:text-faint">
                            <li>{t('sc3Step1')}</li>
                            <li>{t('sc3Step2')}</li>
                            <li>{t('sc3Step3')}</li>
                            <li>{t('sc3Step4')}</li>
                        </ol>
                    </Disclosure>

                    <Disclosure title={t('troubleTitle')} subtitle={t('troubleIntro')}>
                        <dl className="flex flex-col gap-3 text-sm leading-relaxed">
                            {(['trouble401a', 'trouble401b', 'trouble400', 'trouble413', 'troubleSilent'] as const).map(
                                (key) => (
                                    <div key={key}>
                                        <dt className="font-mono text-xs text-faint">{t(`${key}Q`)}</dt>
                                        <dd>{t(`${key}A`)}</dd>
                                    </div>
                                )
                            )}
                        </dl>
                    </Disclosure>
                </div>
            </section>

        </main>
    );
}
