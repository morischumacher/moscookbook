'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/formatDate';
import Loading from '@/components/ui/Loading';

interface Item {
    id: number;
    kind: 'capture' | 'error' | 'ticket';
    note: string | null;
    title: string;
    createdAt: string;
    closedAt: string | null;
    closedReason: string | null;
    auto: boolean;
    dismissed: boolean;
}

/**
 * What has been handed over for fixing, and the public address it is read
 * from. Closing an item keeps it visible there for a month as "recently
 * closed"; removing takes it off altogether.
 */
export default function WorkPanel() {
    const t = useTranslations('Work');
    const locale = useLocale();
    const [items, setItems] = useState<Item[] | null>(null);
    // Only ever rendered on the client (the tab is opened by a tap), so the
    // address can be read straight away.
    const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin));
    const [copied, setCopied] = useState(false);

    const load = useCallback(
        () =>
            fetch('/api/work-items')
                .then((res) => (res.ok ? res.json() : { items: [] }))
                .then((data: { items: Item[] }) => setItems(data.items))
                .catch(() => setItems([])),
        []
    );

    useEffect(() => {
        void load();
    }, [load]);

    const act = async (id: number, init: RequestInit) => {
        await fetch(`/api/work-items/${id}`, { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null);
        await load();
    };

    const publicUrl = origin ? `${origin}/api/work` : '/api/work';

    return (
        <div>
            <p className="text-sm leading-relaxed text-muted">{t('explain')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-surface px-3 py-2">
                <a href="/api/work" target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs underline underline-offset-4">
                    {publicUrl}
                </a>
                <button
                    type="button"
                    onClick={() => {
                        void navigator.clipboard.writeText(publicUrl).then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                        });
                    }}
                    className="text-xs text-muted underline underline-offset-4"
                >
                    {copied ? t('copied') : t('copy')}
                </button>
            </div>

            {items === null ? (
                <Loading label={t('loading')} />
            ) : items.length === 0 ? (
                <p className="py-12 text-center text-muted">{t('empty')}</p>
            ) : (
                <ul className="mt-6 divide-y divide-line">
                    {items.map((item) => (
                        <li key={item.id} className={`py-4 ${item.closedAt || item.dismissed ? 'opacity-60' : ''}`}>
                            <p className="text-xs uppercase tracking-widest text-faint">
                                #{item.id} · {t(`kind.${item.kind}`)} · {formatDate(new Date(item.createdAt), locale, 'short')}
                                {item.auto && <> · {t('auto')}</>}
                                {item.dismissed ? (
                                    <> · {t('withdrawn')}</>
                                ) : (
                                    item.closedAt && <> · {t(`closedAs.${item.closedReason ?? 'done'}`)}</>
                                )}
                            </p>
                            <p className="mt-1 break-words font-medium">{item.title}</p>
                            {item.note && <p className="mt-1 text-sm text-muted">„{item.note}“</p>}
                            <div className="mt-2 flex gap-4 text-sm">
                                {item.dismissed ? (
                                    <button
                                        type="button"
                                        onClick={() => void act(item.id, { method: 'PATCH', body: JSON.stringify({ dismissed: false }) })}
                                        className="underline underline-offset-4"
                                    >
                                        {t('restore')}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => void act(item.id, { method: 'PATCH', body: JSON.stringify({ closed: !item.closedAt }) })}
                                            className="underline underline-offset-4"
                                        >
                                            {item.closedAt ? t('reopen') : t('close')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void act(item.id, { method: 'DELETE' })}
                                            className="text-muted underline underline-offset-4 hover:text-danger"
                                        >
                                            {t('withdraw')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
