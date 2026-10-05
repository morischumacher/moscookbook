'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useConfirm } from '@/components/ui/useConfirm';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';

/*
 * Connecting an AI to the task list: the list's address, the brief, the key it
 * reports "done" with. On the AI page, where the rest of the AI is — it sat at
 * the foot of the reports' task list, where nobody looked for it.
 */

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


const emptySubscribe = () => () => {};

/** The public address, the prompt and the key: what an AI needs, set up once. */
export default function ConnectAi() {
    const t = useTranslations('Work');
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

    const publicUrl = origin ? `${origin}/api/work` : '/api/work';

    return (
        <details className="group mt-10 rounded-xl border border-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="shrink-0 text-faint transition-transform group-open:rotate-90">
                    ▸
                </span>
                <span className="font-bold">{t('connectHeading')}</span>
            </summary>
            <div className="border-t border-line p-4">
                <p className="text-sm leading-relaxed text-muted">{t('explain')}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-surface px-3 py-2">
                    <a href="/api/work" target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs underline underline-offset-4">
                        {publicUrl}
                    </a>
                    <button type="button" onClick={() => void copy('link', async () => publicUrl)} className="min-h-11 text-sm text-muted underline underline-offset-4">
                        {copied === 'link' ? t('copied') : t('copy')}
                    </button>
                </div>

                {/*
                    For a chat assistant that cannot open the address, or for
                    keeping: the brief, the list, or both in one paste.
                */}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
            </div>
        </details>
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
                <button type="button" disabled={busy} onClick={() => void make()} className={`mt-3 ${buttonSecondary}`}>
                    {exists ? t('tokenRemake') : t('tokenMake')}
                </button>
            )}
        </section>
    );
}
