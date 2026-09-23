'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useConfirm } from '@/components/ui/useConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import type { ChangedField, RecipeSnapshot } from '@/lib/revisions';

export interface HistoryEntry {
    id: number;
    createdAt: string;
    editedBy: string | null;
    /** What the edit that replaced this version changed. */
    changed: ChangedField[];
    snapshot: RecipeSnapshot;
}

/**
 * Earlier versions of the recipe, newest first: when, who changed it, what
 * they changed, what it said then — and a way back.
 */
export default function RecipeHistory({ recipeId, entries }: { recipeId: number; entries: HistoryEntry[] }) {
    const t = useTranslations('RecipeForm');
    const locale = useLocale();
    const [ask, dialog] = useConfirm();
    const [busy, setBusy] = useState<number | null>(null);
    const [failed, setFailed] = useState(false);

    if (entries.length === 0) return null;

    const restore = async (entry: HistoryEntry) => {
        const when = new Date(entry.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
        if (!(await ask({ title: t('restoreQuestion', { when }), confirmLabel: t('restore') }))) return;
        setBusy(entry.id);
        setFailed(false);
        try {
            const res = await fetch(`/api/recipes/${recipeId}/revisions/${entry.id}`, { method: 'POST' });
            if (!res.ok) {
                setFailed(true);
                return;
            }
            // A full reload, not a refresh: the form above keeps what it
            // loaded in its own state, and would save the old text back over
            // the restored one. Its autosaved draft goes too, for the same reason.
            try {
                window.localStorage.removeItem(`moscookbook:draft:${recipeId}`);
            } catch {
                /* storage is a convenience */
            }
            window.location.reload();
        } catch {
            setFailed(true);
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="mt-16 border-t border-line pt-8">
            {dialog}
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted">{t('historyTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('historyExplain')}</p>
            {failed && <p role="alert" className="mt-2 text-sm text-danger">{t('restoreFailed')}</p>}

            <ol className="mt-4 divide-y divide-line">
                {entries.map((entry) => (
                    <li key={entry.id} className="py-3">
                        <details>
                            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
                                <span>
                                    <span className="font-medium">
                                        {new Date(entry.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                    {entry.editedBy && <span className="text-muted"> · {t('editedBy', { name: entry.editedBy })}</span>}
                                </span>
                                <span className="text-sm text-muted">
                                    {entry.changed.length > 0
                                        ? t('changedAfter', { fields: entry.changed.map((field) => t(`field_${field}`)).join(', ') })
                                        : ''}
                                </span>
                            </summary>

                            <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
                                <p className="font-bold">{entry.snapshot.title}</p>
                                {entry.snapshot.ingredients.length > 0 && (
                                    <ul className="mt-2">
                                        {entry.snapshot.ingredients.map((row, index) => (
                                            <li key={index}>
                                                {row.raw && <span className="font-semibold">{row.raw} </span>}
                                                {row.name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p className="mt-3 whitespace-pre-line text-muted">{entry.snapshot.instructions}</p>
                                <button
                                    type="button"
                                    onClick={() => void restore(entry)}
                                    disabled={busy !== null}
                                    className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line px-4 font-medium hover:border-ink disabled:opacity-50"
                                >
                                    <BusyLabel busy={busy === entry.id}>{t('restore')}</BusyLabel>
                                </button>
                            </div>
                        </details>
                    </li>
                ))}
            </ol>
        </section>
    );
}
