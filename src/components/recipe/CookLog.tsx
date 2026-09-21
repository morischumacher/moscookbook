'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { formatDate } from '@/lib/formatDate';
import { sinceCooked } from '@/lib/sinceCooked';

export interface CookLogEntry {
    id: number;
    cookedAt: Date;
    note: string | null;
    userId: number;
    user: { name: string } | null;
}

/**
 * When this was last made, and what to do differently.
 *
 * One button. Pressing it records today and nothing else — no dialog, no date
 * picker, no form — because the thing worth capturing is the fact, and anything
 * standing between the fact and the button means the fact does not get
 * captured. The note comes after, on the line that is already there, exactly
 * like a cooked photograph's caption.
 *
 * The heading is the answer to the only question anybody asks a cooking log:
 * *how long ago*. "12 August" is a date; "three weeks ago" is the answer.
 *
 * Everyone's entries are shown, because this is a cookbook two people share and
 * "Anna made it last week" is worth knowing — but only your own can be written
 * on or taken back. Not even an admin can edit somebody else's, unlike a
 * photograph, which sits on a shared page: this is one person's record of their
 * own evening.
 */
export default function CookLog({
    recipeId,
    entries,
    canLog,
    currentUserId,
    locale,
}: {
    recipeId: number;
    entries: CookLogEntry[];
    canLog: boolean;
    currentUserId: number | null;
    locale: string;
}) {
    const t = useTranslations('Cooked');
    const router = useRouter();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const latest = entries[0];
    const since = latest ? sinceCooked(latest.cookedAt) : null;

    const log = async () => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/cooked`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setError(data?.message || t('failed'));
                return;
            }
            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    const writeNote = async (entryId: number, note: string) => {
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/cooked?entry=${entryId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note }),
            });

            if (!res.ok) setError(t('failed'));
            else router.refresh();
        } catch {
            setError(t('failed'));
        }
    };

    const remove = async (entryId: number) => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/cooked?entry=${entryId}`, {
                method: 'DELETE',
            });
            if (!res.ok) setError(t('failed'));
            else router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    if (entries.length === 0 && !canLog) return null;

    return (
        <section className="print:hidden mt-16 border-t border-line pt-8">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                    {since
                        ? t(`since.${since.key}`, { count: since.count })
                        : t('neverCooked')}
                </h2>

                {canLog && (
                    <button
                        type="button"
                        onClick={log}
                        disabled={busy}
                        className="text-sm underline underline-offset-4 disabled:opacity-50"
                    >
                        {busy ? t('logging') : t('logIt')}
                    </button>
                )}
            </div>

            {error && (
                <p role="alert" className="mb-4 text-sm text-danger">
                    {error}
                </p>
            )}

            {entries.length > 0 && (
                <ul className="flex flex-col divide-y divide-line">
                    {entries.map((entry) => {
                        const mine = currentUserId !== null && entry.userId === currentUserId;

                        return (
                            <li key={entry.id} className="py-3">
                                <p className="text-xs uppercase tracking-widest text-faint">
                                    {entry.user?.name ?? t('someone')} ·{' '}
                                    {formatDate(entry.cookedAt, locale, 'short')}
                                </p>

                                {mine ? (
                                    <input
                                        type="text"
                                        defaultValue={entry.note ?? ''}
                                        placeholder={t('notePlaceholder')}
                                        aria-label={t('noteLabel')}
                                        maxLength={280}
                                        disabled={busy}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') event.currentTarget.blur();
                                        }}
                                        // Saved on leaving the field, not on
                                        // every keystroke: a note is a sentence
                                        // somebody is still writing until they
                                        // stop.
                                        onBlur={(event) => {
                                            const next = event.target.value.trim();
                                            if (next !== (entry.note ?? '')) {
                                                void writeNote(entry.id, next);
                                            }
                                        }}
                                        // 16px, or iOS Safari zooms the page in.
                                        className="mt-1 w-full border-0 bg-transparent p-0 font-serif text-base leading-snug text-muted outline-none placeholder:text-faint focus:text-ink"
                                    />
                                ) : (
                                    entry.note && (
                                        <p className="mt-1 font-serif leading-snug text-muted">
                                            {entry.note}
                                        </p>
                                    )
                                )}

                                {mine && (
                                    <span className="mt-1 inline-block">
                                        <InlineConfirm
                                            label={t('undoLog')}
                                            confirmLabel={t('undoLog')}
                                            destructive
                                            disabled={busy}
                                            onConfirm={() => remove(entry.id)}
                                            className="text-xs text-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
                                        />
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
