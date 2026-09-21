'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';

/**
 * Downloading a copy of everything, and putting one back.
 *
 * "Replace what is already here" used to be a bare checkbox next to a file
 * picker. Ticking it and choosing a file overwrote every recipe whose slug the
 * archive carried, with no question asked — less ceremony than removing one
 * cooked photograph, which does ask. The tick is now a decision the person is
 * told the shape of before it happens.
 */
export default function BackupPanel() {
    const t = useTranslations('Backup');
    const router = useRouter();
    const [ask, dialog] = useConfirm();

    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [failures, setFailures] = useState<{ slug: string; reason: string }[]>([]);
    const [error, setError] = useState('');
    const [replace, setReplace] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const restore = async (file: File) => {
        setMessage('');
        setFailures([]);
        setError('');

        // Asked here rather than at the checkbox: at the checkbox nothing is
        // about to happen yet, and a question about a thing that is not
        // happening is one people learn to click past.
        if (replace) {
            const sure = await ask({
                title: t('confirmReplaceTitle'),
                body: t('confirmReplaceBody'),
                confirmLabel: t('confirmReplaceGo'),
                destructive: true,
            });

            if (!sure) {
                if (fileInput.current) fileInput.current.value = '';
                return;
            }
        }

        setBusy(true);

        try {
            const text = await file.text();
            let archive: unknown;
            try {
                archive = JSON.parse(text);
            } catch {
                setError(t('notJson'));
                return;
            }

            const res = await fetch('/api/import/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archive, replace }),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok || !data) {
                setError(data?.message || t('failed'));
                return;
            }

            setMessage(
                t('result', { created: data.created, replaced: data.replaced, skipped: data.skipped })
            );

            // The restore no longer stops at the first bad row, so what did not
            // go in has to be said out loud — a count that quietly disagrees
            // with the archive is how somebody finds out months later.
            if (Array.isArray(data.failed) && data.failed.length > 0) {
                setFailures(data.failed);
            }

            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    return (
        <section className="mt-12 rounded-xl border border-line p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted">{t('title')}</h2>
            <p className="mt-2 text-sm text-muted">{t('explanation')}</p>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                {/*
                  * A plain link with `download`, so the browser saves the file
                  * itself. next/link would intercept this as a client-side
                  * navigation and never trigger the download.
                  */}
                <a
                    href="/api/export"
                    download
                    className="flex h-10 items-center rounded-full bg-ink px-4 font-medium text-page"
                >
                    {t('download')}
                </a>

                <label className="flex h-10 cursor-pointer items-center rounded-full border border-line px-4 hover:border-ink">
                    {busy ? t('restoring') : t('restore')}
                    {/* sr-only rather than hidden: `display: none` cannot take
                        focus, so the file picker was unreachable by keyboard. */}
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json,.json"
                        className="sr-only"
                        disabled={busy}
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) restore(file);
                        }}
                    />
                </label>

                <label className="flex items-center gap-2 text-muted">
                    <input
                        type="checkbox"
                        checked={replace}
                        onChange={(event) => setReplace(event.target.checked)}
                        className="h-4 w-4"
                    />
                    {t('replaceExisting')}
                </label>
            </div>

            <p className="mt-4 text-sm text-muted">{t('offlineHint')}</p>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}
            {message && !error && <p className="mt-4 text-sm">{message}</p>}

            {failures.length > 0 && (
                <div className="mt-4 rounded-lg border border-danger-line bg-danger-surface p-3">
                    <p className="text-sm font-semibold text-danger">
                        {t('someFailed', { count: failures.length })}
                    </p>
                    <ul className="mt-2 flex flex-col gap-1 text-sm text-danger">
                        {failures.slice(0, 10).map((entry) => (
                            <li key={entry.slug} className="break-words">
                                <span className="font-mono">{entry.slug}</span> — {entry.reason}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {dialog}
        </section>
    );
}
