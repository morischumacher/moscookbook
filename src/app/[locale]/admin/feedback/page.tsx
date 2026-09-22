'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/formatDate';
import { pageContainer, pageHeading, pageTop, buttonSecondary } from '@/lib/ui';

interface FeedbackRow {
    id: number;
    kind: string;
    body: string;
    path: string | null;
    createdAt: string;
    resolvedAt: string | null;
    user: { name: string } | null;
}

/**
 * What people have said about the tool.
 *
 * Open ones first and by default, because the list exists to be worked
 * through rather than browsed; the resolved ones are one tap away so that
 * "did I already do this?" has an answer.
 *
 * The page it came from is shown as written. It is the most useful line in
 * most of these, and turning it into a link would be inviting a tap that
 * loses the list.
 *
 * This page has a real error state, unlike the one it is modelled on before
 * that was fixed: a failed request here used to render an empty list, which
 * on a page whose job is "here is what people told you" is the most
 * misleading thing it could say.
 */
export default function AdminFeedbackPage() {
    const t = useTranslations('Feedback');
    const locale = useLocale();

    const [entries, setEntries] = useState<FeedbackRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showResolved, setShowResolved] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/feedback?resolved=${showResolved}`);
            if (!res.ok) throw new Error(t('loadFailed'));
            const data = await res.json();
            setEntries(data.entries);
        } catch {
            setEntries([]);
            setError(t('loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [showResolved, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const setResolved = async (id: number, resolved: boolean) => {
        try {
            const res = await fetch('/api/feedback', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, resolved }),
            });

            if (!res.ok) {
                setError(t('failed'));
                return;
            }

            await load();
        } catch {
            setError(t('failed'));
        }
    };

    return (
        <main className={`${pageContainer} ${pageTop} pb-32`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className={`${pageHeading} flex-1 border-0 pb-0`}>{t('adminTitle')}</h1>

                <button
                    type="button"
                    onClick={() => setShowResolved(!showResolved)}
                    className={buttonSecondary}
                >
                    {showResolved ? t('showOpen') : t('showResolved')}
                </button>
            </div>

            {error && (
                <p role="alert" className="mt-6 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {loading ? (
                <p className="mt-8 text-muted">{t('loading')}</p>
            ) : entries.length === 0 ? (
                <p className="mt-8 text-muted">{showResolved ? t('noneResolved') : t('noneOpen')}</p>
            ) : (
                <ul className="mt-8 flex flex-col divide-y divide-line">
                    {entries.map((entry) => (
                        <li key={entry.id} className="py-5 first:pt-0">
                            <p className="text-xs uppercase tracking-widest text-faint">
                                {t(`kind_${entry.kind}`)} · {entry.user?.name ?? t('someone')} ·{' '}
                                {formatDateTime(new Date(entry.createdAt), locale)}
                            </p>

                            <p className="mt-2 whitespace-pre-wrap font-serif leading-relaxed text-ink">
                                {entry.body}
                            </p>

                            {entry.path && (
                                <p className="mt-2 font-mono text-xs text-muted">{entry.path}</p>
                            )}

                            <button
                                type="button"
                                onClick={() => void setResolved(entry.id, !entry.resolvedAt)}
                                className="mt-3 text-xs text-muted underline underline-offset-4 hover:text-ink"
                            >
                                {entry.resolvedAt ? t('reopen') : t('markDone')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
