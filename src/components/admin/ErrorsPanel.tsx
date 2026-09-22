'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/formatDate';
import { messageFrom } from '@/lib/apiMessage';
import InlineConfirm from '@/components/ui/InlineConfirm';
import Loading from '@/components/ui/Loading';

interface ErrorRow {
    id: number;
    source: string;
    message: string;
    stack: string | null;
    path: string | null;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
}

/**
 * What is currently broken.
 *
 * One row per problem, not per occurrence, with a count — so this stays
 * something you can read rather than a log you scroll past.
 *
 * A panel rather than a page since errors and tickets became one entry in the
 * admin's navigation. They are the same question asked from two sides — what
 * the application noticed, and what a person noticed — and two tabs for that
 * was two taps and a decision about which one to check first.
 */
export default function ErrorsPanel() {
    const t = useTranslations('Errors');
    // The site's language, not the browser's: these three pages used
    // toLocaleDateString() with no argument, so a German reader on an
    // English-language phone saw 9/21/2026 here and 21. September 2026
    // on the blog, in one visit.
    const locale = useLocale();

    const [errors, setErrors] = useState<ErrorRow[]>([]);
    const [loading, setLoading] = useState(true);
    /**
     * This page had no error state at all, on the one page whose job is to
     * tell you when things break. A 500 from /api/errors left the list empty,
     * loading went false, and it rendered "all quiet" — the most misleading
     * sentence it could possibly have shown.
     */
    const [error, setError] = useState('');
    const [showResolved, setShowResolved] = useState(false);
    const [expanded, setExpanded] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/errors?resolved=${showResolved}`);
            if (!res.ok) throw new Error(t('loadFailed'));
            const data = await res.json();
            setErrors(data.errors);
        } catch (err) {
            setErrors([]);
            setError(err instanceof Error ? err.message : t('loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [showResolved, t]);

    useEffect(() => {
        load();
    }, [load]);

    /*
     * Deleting one for good.
     *
     * DELETE /api/errors/[id] has existed since the error log did, correct
     * and tested and called by nothing — the interaction map listed it as one
     * of two endpoints with no way to reach them. It is worth having: a
     * resolved row that keeps coming back is history, and one that was noise
     * the first time is clutter for ever.
     *
     * Offered only among the resolved ones. Deciding an error is dealt with
     * is the normal path and it is reversible; removing the row is neither,
     * so it sits one deliberate step further in.
     */
    const remove = async (id: number) => {
        try {
            const res = await fetch(`/api/errors/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                setError(await messageFrom(res, t('deleteFailed')));
                return;
            }
            setErrors((current) => current.filter((row) => row.id !== id));
        } catch {
            setError(t('deleteFailed'));
        }
    };

    const resolve = async (id: number) => {
        // The row used to vanish whatever happened, so an expired session
        // looked exactly like a successful resolve until the next reload.
        try {
            const res = await fetch(`/api/errors/${id}`, { method: 'POST' });
            if (!res.ok) throw new Error(t('resolveFailed'));
            setErrors((current) => current.filter((row) => row.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('resolveFailed'));
        }
    };

    return (
        <div>
            <p className="mb-6 font-serif text-muted">{t('explanation')}</p>

            <button
                type="button"
                onClick={() => setShowResolved(!showResolved)}
                className="mb-8 text-sm underline underline-offset-4"
            >
                {showResolved ? t('showOpen') : t('showResolved')}
            </button>

            {/* Before the list, and instead of it: "all quiet" must never be
                shown when the truth is "could not ask". */}
            {error && (
                <div
                    role="alert"
                    className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-danger-surface p-3"
                >
                    <p className="text-sm text-danger">{error}</p>
                    <button
                        type="button"
                        onClick={load}
                        className="text-sm font-medium text-danger underline underline-offset-4"
                    >
                        {t('retry')}
                    </button>
                </div>
            )}

            {loading ? (
                <Loading label={t('loading')} />
            ) : error ? null : errors.length === 0 ? (
                <p className="border-t border-line py-16 text-center text-muted">
                    {showResolved ? t('noneResolved') : t('allQuiet')}
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-line">
                    {errors.map((row) => (
                        <li key={row.id} className="py-5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-widest text-faint">
                                <span>{t(`source.${row.source}`)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{t('seen', { count: row.count })}</span>
                                <span aria-hidden="true">·</span>
                                <time dateTime={row.lastSeenAt}>
                                    {formatDateTime(row.lastSeenAt, locale)}
                                </time>
                            </div>

                            <p className="mt-2 font-mono text-sm leading-snug">{row.message}</p>
                            {row.path && <p className="mt-1 text-sm text-muted">{row.path}</p>}

                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                {row.stack && (
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                                        className="text-muted underline underline-offset-4"
                                    >
                                        {expanded === row.id ? t('hideStack') : t('showStack')}
                                    </button>
                                )}
                                {!showResolved ? (
                                    <button
                                        type="button"
                                        onClick={() => resolve(row.id)}
                                        className="underline underline-offset-4"
                                    >
                                        {t('resolve')}
                                    </button>
                                ) : (
                                    <InlineConfirm
                                        label={t('delete')}
                                        question={t('deleteConfirm')}
                                        confirmLabel={t('delete')}
                                        destructive
                                        onConfirm={() => remove(row.id)}
                                        className="text-danger underline underline-offset-4"
                                    />
                                )}
                            </div>

                            {expanded === row.id && row.stack && (
                                <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed">
                                    {row.stack}
                                </pre>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
