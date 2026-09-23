'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BusyLabel } from '@/components/ui/Busy';
import type { WorkKind } from '@/lib/workItems';

export interface WorkState {
    id: number;
    auto: boolean;
    closed: boolean;
}

/**
 * The work list, from the row's side: put it on (with an optional note), or
 * take it back off — including when the application put it there by itself.
 * For whoever does the fixing, a person or an assistant.
 */
export default function ShareToWorkList({
    kind,
    id,
    work = null,
    photoCount = 0,
    className = '',
}: {
    kind: WorkKind;
    id: number;
    /** Whether the row is on the list already, as the list API reports it. */
    work?: WorkState | null;
    /** Screenshots on the row; offered to publish along, off by default. */
    photoCount?: number;
    className?: string;
}) {
    const t = useTranslations('Work');
    const [state, setState] = useState<WorkState | null>(work);
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [withPhotos, setWithPhotos] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const share = async () => {
        setBusy(true);
        setFailed(false);
        try {
            const res = await fetch('/api/work-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, id, note, withPhotos }),
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setState({ id: data.id, auto: false, closed: false });
            setOpen(false);
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    const withdraw = async () => {
        if (!state) return;
        setBusy(true);
        const res = await fetch(`/api/work-items/${state.id}`, { method: 'DELETE' }).catch(() => null);
        setBusy(false);
        if (res?.ok) setState(null);
        else setFailed(true);
    };

    if (state && !state.closed) {
        return (
            <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}>
                <span className="text-muted">✓ {state.auto ? t('sharedAuto') : t('shared')}</span>
                <button type="button" onClick={() => void withdraw()} disabled={busy} className="text-muted underline underline-offset-4 hover:text-danger">
                    <BusyLabel busy={busy}>{t('withdraw')}</BusyLabel>
                </button>
            </span>
        );
    }

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className={`text-left text-sm underline underline-offset-4 ${className}`}>
                {t('share')}
            </button>
        );
    }

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void share();
            }}
            className={`flex w-full flex-col gap-2 ${className}`}
        >
            <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('notePlaceholder')}
                maxLength={1000}
                autoFocus
                className="w-full min-w-0 rounded-lg border border-control bg-transparent px-3 py-2 text-sm outline-none focus:border-ink"
            />
            {photoCount > 0 && (
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={withPhotos} onChange={(event) => setWithPhotos(event.target.checked)} />
                    {t('withPhotos', { count: photoCount })}
                </label>
            )}
            <p className="text-xs text-faint">{t('publicHint')}</p>
            <div className="flex gap-4 text-sm">
                <button type="submit" disabled={busy} className="font-medium underline underline-offset-4">
                    <BusyLabel busy={busy}>{t('shareNow')}</BusyLabel>
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-muted underline underline-offset-4">
                    {t('cancel')}
                </button>
            </div>
            {failed && <p className="text-xs text-danger">{t('failed')}</p>}
        </form>
    );
}
