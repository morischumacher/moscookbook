'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/formatDate';
import { buttonSecondary } from '@/lib/ui';
import Loading from '@/components/ui/Loading';

interface TicketRow {
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
export default function TicketsPanel() {
    const t = useTranslations('Tickets');
    const locale = useLocale();

    const [entries, setEntries] = useState<TicketRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showResolved, setShowResolved] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/tickets?resolved=${showResolved}`);
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

    /**
     * The ticket as a block of text, ready to paste wherever it gets fixed.
     *
     * The gap this closes is small and it is the whole reason the list exists:
     * somebody reads a complaint, agrees with it, and then has to retype it
     * somewhere else with the page and the date, which is the moment most of
     * them stop being tickets and go back to being remarks.
     *
     * Plain text rather than any particular tool's format. It pastes into a
     * chat, an issue tracker, a note or a message, and none of those are
     * chosen here because none of them should have to be.
     */
    const asTicket = (entry: TicketRow) =>
        [
            `[${t(`kind_${entry.kind}`)}] ${entry.body.trim()}`,
            '',
            entry.path ? `Page:   ${entry.path}` : null,
            `From:   ${entry.user?.name ?? t('someone')} · ${formatDateTime(new Date(entry.createdAt), locale)}`,
            `Ticket: #${entry.id}`,
        ]
            .filter((line) => line !== null)
            .join('\n');

    const copy = async (entry: TicketRow) => {
        setError('');

        try {
            await navigator.clipboard.writeText(asTicket(entry));
            setCopiedId(entry.id);
            window.setTimeout(() => setCopiedId(null), 2500);
        } catch {
            setError(t('copyFailed'));
        }
    };

    const setResolved = async (id: number, resolved: boolean) => {
        try {
            const res = await fetch('/api/tickets', {
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
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <p className="flex-1 font-serif text-muted">{t('adminExplanation')}</p>

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
                <Loading label={t('loading')} className="mt-8" />
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

                            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                                <button
                                    type="button"
                                    onClick={() => void copy(entry)}
                                    title={t('ticketHint')}
                                    className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                                >
                                    {copiedId === entry.id ? t('copied') : t('copyTicket')}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => void setResolved(entry.id, !entry.resolvedAt)}
                                    className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                                >
                                    {entry.resolvedAt ? t('reopen') : t('markDone')}
                                </button>
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
