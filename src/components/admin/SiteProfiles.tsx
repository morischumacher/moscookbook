'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import InlineConfirm from '@/components/ui/InlineConfirm';
import Disclosure from '@/components/ui/Disclosure';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * The sites the cookbook has worked out how to read.
 *
 * Mostly this list fills itself: importing from a new site teaches it one, and
 * nobody has to come here. The screen exists for the two moments when the
 * automatic path is not enough.
 *
 * **A site has changed.** The automatic recovery works — three bad imports and
 * the site is re-learned — but three bad imports is a slow way to say
 * something you can already see. "Neu lernen" says it in one press.
 *
 * **A site is about to be used a lot.** Teaching it once, deliberately, before
 * importing ten recipes from it beats discovering on the eleventh that the
 * first ten each cost a model call.
 *
 * The strategies are shown rather than summarised, folded away behind a
 * disclosure. A profile is the one thing here written by a model and followed
 * afterwards without anybody looking, so being able to look is the point —
 * "Zutaten: die Liste unter der Überschrift *Ingredients*" is a sentence
 * anybody can check against the actual page.
 */

interface Strategy {
    kind: 'meta' | 'jsonLd' | 'listAfterHeading' | 'textAfterHeading' | 'selector';
    property?: string;
    path?: string;
    heading?: string;
    selector?: string;
    take?: 'text' | 'each';
}

interface Profile {
    host: string;
    profile: Record<string, Strategy> | null;
    learnedFrom: string;
    learnedBy: string;
    learnedAt: string;
    usedAt: string | null;
    failures: number;
    stale: boolean;
    lastError: string | null;
}

export default function SiteProfiles() {
    const t = useTranslations('SiteProfiles');
    const locale = useLocale();

    const [profiles, setProfiles] = useState<Profile[] | null>(null);
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ good: boolean; text: string } | null>(null);

    const load = useCallback(async () => {
        const response = await fetch('/api/site-profiles');
        if (!response.ok) {
            setProfiles([]);
            return;
        }
        const data = (await response.json()) as { profiles: Profile[] };
        setProfiles(data.profiles);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function learn(target: string) {
        if (target.trim() === '') return;

        setBusy(true);
        setMessage(null);

        try {
            const response = await fetch('/api/site-profiles', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ url: target }),
            });

            const data = (await response.json()) as { learned?: boolean; message?: string };

            /*
             * A refusal is not an error, and the difference matters on screen.
             * "Nicht gelernt: das Profil fand 40% der Zutaten" means the check
             * worked, which is the feature behaving correctly — showing it in
             * red next to a broken-plug icon would teach the wrong lesson.
             */
            setMessage({
                good: response.ok && data.learned === true,
                text: data.message ?? t('failed'),
            });

            if (response.ok) {
                setUrl('');
                await load();
            }
        } catch {
            setMessage({ good: false, text: t('failed') });
        } finally {
            setBusy(false);
        }
    }

    async function forget(host: string) {
        await fetch(`/api/site-profiles/${encodeURIComponent(host)}`, { method: 'DELETE' });
        await load();
    }

    /** "die Liste unter der Überschrift «Ingredients»", in words. */
    function describe(field: string, strategy: Strategy): string {
        const where =
            strategy.kind === 'meta'
                ? t('viaMeta', { property: strategy.property ?? '' })
                : strategy.kind === 'jsonLd'
                    ? t('viaJsonLd', { path: strategy.path ?? '' })
                    : strategy.kind === 'listAfterHeading'
                        ? t('viaList', { heading: strategy.heading ?? '' })
                        : strategy.kind === 'textAfterHeading'
                            ? t('viaText', { heading: strategy.heading ?? '' })
                            : t('viaSelector', { selector: strategy.selector ?? '' });

        return `${t(`field_${field}`)}: ${where}`;
    }

    return (
        <section className="mt-14">
            <h2 className="mb-2 text-xl font-bold tracking-tight">{t('title')}</h2>
            <p className="mb-6 font-serif text-muted">{t('intro')}</p>

            <form
                className="mb-6 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void learn(url);
                }}
            >
                <label className="min-w-[16rem] flex-1">
                    <span className="mb-1 block text-sm text-muted">{t('urlLabel')}</span>
                    <input
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://…"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-control bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-ink"
                    />
                </label>
                <button type="submit" className={buttonPrimarySmall} disabled={busy || url.trim() === ''}>
                    {busy ? t('learning') : t('learn')}
                </button>
            </form>

            {message && (
                <p className={`mb-6 text-sm ${message.good ? 'text-accent-text' : 'text-muted'}`}>
                    {message.text}
                </p>
            )}

            {profiles === null ? null : profiles.length === 0 ? (
                <p className="font-serif text-muted">{t('none')}</p>
            ) : (
                <ul className="flex flex-col gap-4">
                    {profiles.map((entry) => (
                        <li key={entry.host} className="rounded-xl border border-control p-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-mono text-sm font-semibold">{entry.host}</span>
                                <span className="text-sm text-muted">
                                    {t('learnedOn', {
                                        date: formatDate(entry.learnedAt, locale),
                                        by: entry.learnedBy,
                                    })}
                                </span>
                            </div>

                            {entry.stale ? (
                                <p className="mt-2 text-sm text-danger">{t('stale')}</p>
                            ) : entry.failures > 0 ? (
                                <p className="mt-2 text-sm text-muted">
                                    {t('failures', { count: entry.failures })}
                                </p>
                            ) : null}

                            {entry.profile && (
                                <div className="mt-3">
                                    <Disclosure title={t('howItReads')}>
                                    <ul className="flex flex-col gap-1 font-serif text-sm text-muted">
                                        {Object.entries(entry.profile).map(([field, strategy]) => (
                                            <li key={field}>{describe(field, strategy)}</li>
                                        ))}
                                    </ul>
                                    </Disclosure>
                                </div>
                            )}

                            <div className="mt-3 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    className="text-sm underline underline-offset-4 disabled:opacity-50"
                                    disabled={busy}
                                    onClick={() => void learn(entry.learnedFrom)}
                                >
                                    {t('relearn')}
                                </button>
                                <InlineConfirm
                                    label={t('forget')}
                                    confirmLabel={t('forgetConfirm')}
                                    destructive
                                    onConfirm={() => void forget(entry.host)}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
