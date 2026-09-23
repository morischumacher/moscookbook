'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/formatDate';
import Loading from '@/components/ui/Loading';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';

interface PublicList {
    currentVersion: string;
    open: { id: number; kind: string; auto: boolean; note: string | null; data: unknown }[];
}

/**
 * The list as Markdown: a heading per item and its data as JSON, which a
 * chat assistant reads as easily as a person does.
 */
function asMarkdown(list: PublicList): string {
    if (list.open.length === 0) return '(no open items)';
    return [
        `currentVersion: ${list.currentVersion}`,
        ...list.open.map((item) =>
            [
                `## work #${item.id} · ${item.kind}${item.auto ? ' · auto' : ''}`,
                item.note ? `Note: ${item.note}` : null,
                '```json',
                JSON.stringify(item.data, null, 2),
                '```',
            ]
                .filter((line) => line !== null)
                .join('\n')
        ),
    ].join('\n\n');
}

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
    const [copied, setCopied] = useState<string | null>(null);
    const [copyFailed, setCopyFailed] = useState(false);

    /** The public list, exactly as an assistant would fetch it. */
    const list = async () => (await fetch('/api/work', { cache: 'no-store' })).json();
    const prompt = async () => (await fetch('/api/work-items/prompt')).text();

    const copy = async (what: string, text: () => Promise<string>) => {
        setCopyFailed(false);
        try {
            await navigator.clipboard.writeText(await text());
            setCopied(what);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            setCopyFailed(true);
        }
    };

    const download = async (format: 'json' | 'md') => {
        const data = await list();
        const text = format === 'json' ? JSON.stringify(data, null, 2) : asMarkdown(data);
        const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'text/markdown' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `arbeitsliste-${new Date().toISOString().slice(0, 10)}.${format}`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

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
                <button type="button" onClick={() => void copy('link', async () => publicUrl)} className="text-xs text-muted underline underline-offset-4">
                    {copied === 'link' ? t('copied') : t('copy')}
                </button>
            </div>

            {/*
                For a chat assistant that cannot open the address, or for
                keeping: the brief, the list, or both in one paste.
            */}
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void copy('both', async () => `${await prompt()}\n\n---\n\n${t('exportListHeading')}\n\n${asMarkdown(await list())}`)} className={buttonPrimarySmall}>
                    {copied === 'both' ? t('copied') : t('copyBoth')}
                </button>
                <button type="button" onClick={() => void copy('prompt', prompt)} className={buttonSecondary}>
                    {copied === 'prompt' ? t('copied') : t('copyPrompt')}
                </button>
                <button type="button" onClick={() => void copy('list', async () => JSON.stringify(await list(), null, 2))} className={buttonSecondary}>
                    {copied === 'list' ? t('copied') : t('copyList')}
                </button>
                <button type="button" onClick={() => void download('json')} className={buttonSecondary}>
                    {t('downloadJson')}
                </button>
                <button type="button" onClick={() => void download('md')} className={buttonSecondary}>
                    {t('downloadMarkdown')}
                </button>
            </div>
            {copyFailed && <p className="mt-2 text-sm text-danger">{t('copyFailed')}</p>}

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
