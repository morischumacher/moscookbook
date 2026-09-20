'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export default function BackupPanel() {
    const t = useTranslations('Backup');
    const router = useRouter();

    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [replace, setReplace] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const restore = async (file: File) => {
        setBusy(true);
        setMessage('');
        setError('');

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
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || t('failed'));
                return;
            }

            setMessage(
                t('result', { created: data.created, replaced: data.replaced, skipped: data.skipped })
            );
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
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
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
        </section>
    );
}
