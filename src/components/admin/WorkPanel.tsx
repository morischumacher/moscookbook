'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/formatDate';
import Loading from '@/components/ui/Loading';
import { useConfirm } from '@/components/ui/useConfirm';
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
    doneAt: string | null;
    doneNote: string | null;
    doneRef: string | null;
}

const emptySubscribe = () => () => {};

export default function WorkPanel() {
    const t = useTranslations('Work');
    const [items, setItems] = useState<Item[] | null>(null);
    const origin = useSyncExternalStore(emptySubscribe, () => window.location.origin, () => '');
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
        link.download = `aufgaben-${new Date().toISOString().slice(0, 10)}.${format}`;
        link.click();
        // Not at once: Safari and Firefox can cancel a download whose address
        // is revoked in the same moment it starts.
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
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

    const [actFailed, setActFailed] = useState(false);
    const act = async (id: number, init: RequestInit) => {
        const res = await fetch(`/api/work-items/${id}`, { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null);
        // A confirm that did not go through (the task changed meanwhile)
        // used to look exactly like one that did.
        setActFailed(!res?.ok);
        await load();
    };

    const publicUrl = origin ? `${origin}/api/work` : '/api/work';

    const live = (items ?? []).filter((item) => !item.closedAt && !item.dismissed);
    const awaiting = live.filter((item) => item.doneAt);
    const open = live.filter((item) => !item.doneAt);
    const rest = (items ?? []).filter((item) => item.closedAt || item.dismissed);

    return (
        <div>
            {actFailed && (
                <p role="alert" className="mb-4 text-sm text-danger">
                    {t('actFailed')}
                </p>
            )}
            {/* First what only you can do: an AI said it is done. */}
            {awaiting.length > 0 && (
                <section className="mb-8">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('awaitingHeading')}</h3>
                    <ul className="mt-2 divide-y divide-line">
                        {awaiting.map((item) => (
                            <AwaitingRow key={item.id} item={item} onAnswer={(confirm, why) => act(item.id, { method: 'PATCH', body: JSON.stringify({ confirm, why }) })} />
                        ))}
                    </ul>
                </section>
            )}
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

            <TaskKey />

            {items === null ? (
                <Loading label={t('loading')} />
            ) : items.length === 0 ? (
                <p className="py-12 text-center text-muted">{t('empty')}</p>
            ) : (
                <>
                    {[
                        { heading: t('openHeading'), rows: open },
                        { heading: t('closedHeading'), rows: rest },
                    ]
                        .filter((group) => group.rows.length > 0)
                        .map((group) => (
                            <section key={group.heading} className="mt-8">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{group.heading}</h3>
                                <ul className="mt-2 divide-y divide-line">
                                    {group.rows.map((item) => (
                                        <li key={item.id} className={`py-4 ${item.closedAt || item.dismissed ? 'opacity-60' : ''}`}>
                                            <ItemHead item={item} />
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
                            </section>
                        ))}
                </>
            )}
        </div>
    );
}

/** The line above a task: number, kind, date, and how it stands. */
function ItemHead({ item }: { item: Item }) {
    const t = useTranslations('Work');
    const locale = useLocale();
    return (
        <>
            <p className="text-xs uppercase tracking-widest text-faint">
                #{item.id} · {t(`kind.${item.kind}`)} · {formatDate(new Date(item.createdAt), locale, 'short')}
                {item.auto && <> · {t('auto')}</>}
                {item.dismissed ? <> · {t('withdrawn')}</> : item.closedAt && <> · {t(`closedAs.${item.closedReason ?? 'done'}`)}</>}
            </p>
            <p className="mt-1 break-words font-medium">{item.title}</p>
            {item.note && (
                <p className="mt-1 whitespace-pre-line text-sm text-muted">
                    {locale === 'de' ? '„' : '“'}
                    {item.note}
                    {locale === 'de' ? '“' : '”'}
                </p>
            )}
        </>
    );
}

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

/** A task the AI reported done: what it says it did, and your answer. */
function AwaitingRow({ item, onAnswer }: { item: Item; onAnswer: (confirm: boolean, why?: string) => Promise<void> }) {
    const t = useTranslations('Work');
    const locale = useLocale();
    const [rejecting, setRejecting] = useState(false);
    const [why, setWhy] = useState('');
    const [busy, setBusy] = useState(false);
    const answer = async (confirm: boolean) => {
        setBusy(true);
        await onAnswer(confirm, confirm ? undefined : why.trim() || undefined);
        setBusy(false);
    };
    return (
        <li className="py-4">
            <ItemHead item={item} />
            <div className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm">
                <p className="text-xs text-faint">{t('reportedDone', { date: formatDate(new Date(item.doneAt!), locale, 'short') })}</p>
                {item.doneNote && <p className="mt-1 whitespace-pre-line">{item.doneNote}</p>}
                {item.doneRef && (
                    <a href={item.doneRef} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block underline underline-offset-4">
                        {t('doneRef')}
                        {/* Where it goes, before anybody taps it. */}
                        <span className="ml-1 text-xs text-faint">({hostOf(item.doneRef)})</span>
                    </a>
                )}
            </div>
            {rejecting ? (
                <div className="mt-3 flex flex-col gap-2">
                    <input
                        value={why}
                        onChange={(event) => setWhy(event.target.value)}
                        placeholder={t('rejectPlaceholder')}
                        maxLength={1000}
                        aria-label={t('rejectPlaceholder')}
                        className="w-full min-w-0 rounded-lg border border-control bg-transparent px-3 py-2 text-base outline-none focus:border-ink"
                    />
                    <div className="flex gap-4 text-sm">
                        <button type="button" disabled={busy} onClick={() => void answer(false)} className="font-medium underline underline-offset-4">
                            {t('rejectSend')}
                        </button>
                        <button type="button" onClick={() => setRejecting(false)} className="text-muted underline underline-offset-4">
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap items-center gap-4">
                    <button type="button" disabled={busy} onClick={() => void answer(true)} className={buttonPrimarySmall}>
                        {t('confirm')}
                    </button>
                    <button type="button" onClick={() => setRejecting(true)} className="text-sm underline underline-offset-4">
                        {t('rejectDone')}
                    </button>
                </div>
            )}
        </li>
    );
}

/** The key an AI reports "done" with: made here, shown once. */
function TaskKey() {
    const t = useTranslations('Work');
    const [exists, setExists] = useState<boolean | null>(null);
    const [shown, setShown] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [ask, dialog] = useConfirm();

    useEffect(() => {
        let alive = true;
        fetch('/api/work-items/token')
            .then((res) => (res.ok ? res.json() : { exists: false }))
            .then((data: { exists: boolean }) => alive && setExists(data.exists))
            .catch(() => alive && setExists(false));
        return () => {
            alive = false;
        };
    }, []);

    const make = async () => {
        // A new key ends the old one: whatever still uses it stops working.
        if (exists && !(await ask({ title: t('tokenRemakeQuestion'), confirmLabel: t('tokenRemake'), destructive: true }))) return;
        setBusy(true);
        const res = await fetch('/api/work-items/token', { method: 'POST' }).catch(() => null);
        const data = res?.ok ? ((await res.json()) as { token: string }) : null;
        setBusy(false);
        if (data) {
            setShown(data.token);
            setExists(true);
            setCopied(false);
        }
    };

    return (
        <section className="mt-6 rounded-lg border border-line px-3 py-3 text-sm">
            {dialog}
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('tokenHeading')}</h3>
            <p className="mt-1 text-muted">{t('tokenExplain')}</p>
            {shown && (
                <p className="mt-2">
                    {t('tokenShown')}{' '}
                    {/* A tap copies it: selecting 47 characters on a phone is
                        the part that goes wrong. */}
                    <button
                        type="button"
                        onClick={() => {
                            void navigator.clipboard
                                .writeText(shown)
                                .then(() => setCopied(true))
                                .catch(() => setCopied(false));
                        }}
                        className="break-all rounded bg-surface px-1 text-left font-mono text-xs underline decoration-dotted underline-offset-4"
                        aria-label={t('tokenCopy')}
                    >
                        {shown}
                    </button>{' '}
                    <span role="status" className="text-xs text-muted">
                        {copied ? t('copied') : t('tokenTapToCopy')}
                    </span>
                </p>
            )}
            {exists && !shown && <p className="mt-2 text-muted">{t('tokenExists')}</p>}
            {exists !== null && (
                <button type="button" disabled={busy} onClick={() => void make()} className="mt-2 underline underline-offset-4">
                    {exists ? t('tokenRemake') : t('tokenMake')}
                </button>
            )}
        </section>
    );
}
