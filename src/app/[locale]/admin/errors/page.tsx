'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

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
 * One row per problem, not per occurrence, with a count — so this stays a page
 * you can read rather than a log you scroll past.
 */
export default function AdminErrorsPage() {
    const t = useTranslations('Errors');
    const tAdmin = useTranslations('Admin');

    const [errors, setErrors] = useState<ErrorRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showResolved, setShowResolved] = useState(false);
    const [expanded, setExpanded] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/errors?resolved=${showResolved}`);
            if (!res.ok) return;
            const data = await res.json();
            setErrors(data.errors);
        } finally {
            setLoading(false);
        }
    }, [showResolved]);

    useEffect(() => {
        load();
    }, [load]);

    const resolve = async (id: number) => {
        await fetch(`/api/errors/${id}`, { method: 'POST' });
        setErrors((current) => current.filter((row) => row.id !== id));
    };

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 pt-10 sm:px-8">
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-6">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                <Link href="/admin" className="text-sm text-muted underline underline-offset-4">
                    {tAdmin('backToRecipes')}
                </Link>
            </div>

            <p className="mb-6 font-serif text-muted">{t('explanation')}</p>

            <button
                type="button"
                onClick={() => setShowResolved(!showResolved)}
                className="mb-8 text-sm underline underline-offset-4"
            >
                {showResolved ? t('showOpen') : t('showResolved')}
            </button>

            {loading ? (
                <p className="text-muted">{t('loading')}</p>
            ) : errors.length === 0 ? (
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
                                    {new Date(row.lastSeenAt).toLocaleString()}
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
                                {!showResolved && (
                                    <button
                                        type="button"
                                        onClick={() => resolve(row.id)}
                                        className="underline underline-offset-4"
                                    >
                                        {t('resolve')}
                                    </button>
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
        </main>
    );
}
