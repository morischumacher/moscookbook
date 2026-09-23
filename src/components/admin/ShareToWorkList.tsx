'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BusyLabel } from '@/components/ui/Busy';
import type { WorkKind } from '@/lib/workItems';

/**
 * "Zur Arbeitsliste": hands one row to the public work list, anonymized, with
 * an optional line saying what is wrong with it — for whoever does the
 * fixing, a person or an assistant.
 */
export default function ShareToWorkList({ kind, id, className = '' }: { kind: WorkKind; id: number; className?: string }) {
    const t = useTranslations('Work');
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

    const share = async () => {
        setState('busy');
        try {
            const res = await fetch('/api/work-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, id, note }),
            });
            setState(res.ok ? 'done' : 'failed');
            if (res.ok) setOpen(false);
        } catch {
            setState('failed');
        }
    };

    if (state === 'done') return <span className={`text-sm text-muted ${className}`}>✓ {t('shared')}</span>;

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
            <p className="text-xs text-faint">{t('publicHint')}</p>
            <div className="flex gap-4 text-sm">
                <button type="submit" disabled={state === 'busy'} className="font-medium underline underline-offset-4">
                    <BusyLabel busy={state === 'busy'}>{t('shareNow')}</BusyLabel>
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-muted underline underline-offset-4">
                    {t('cancel')}
                </button>
            </div>
            {state === 'failed' && <p className="text-xs text-danger">{t('failed')}</p>}
        </form>
    );
}
