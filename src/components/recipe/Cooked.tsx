'use client';

import { useRef, useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import Lightbox from '@/components/recipe/Lightbox';
import { compressImage, UPLOAD_LIMIT_BYTES } from '@/lib/imageCompression';
import { formatDate } from '@/lib/formatDate';
import { sinceCooked } from '@/lib/sinceCooked';
import Avatar from '@/components/Avatar';
import { photoControl } from '@/lib/ui';

export interface CookedEntry {
    id: number;
    cookedAt: Date;
    note: string | null;
    userId: number | null;
    user: { name: string; avatarUrl: string | null } | null;
    photos: { id: number; url: string }[];
}

/**
 * "Nachgekocht" — who made this, when, what they would change, and what it
 * looked like.
 *
 * **This was two sections.** One headed "Cooked today" with a button that
 * recorded the fact, one headed "Nachgekocht" with a button that took a
 * photograph, sitting one above the other on the same page, both meaning *I
 * made this*. The person they were built for looked at them and asked what
 * they were for — which is the correct response to two headings for one idea,
 * and the reason they are now one.
 *
 * The shape that falls out of merging them is better than either half was. An
 * evening is one row: the fact, optionally a line about what to change, and
 * however many pictures were taken. Three photographs of one dinner used to be
 * three separate entries implying three dinners.
 *
 * What is kept from the old design, because it was right: **one tap records
 * it**. No dialog, no date field, no form. Everything else — the note, the
 * pictures — is added afterwards to a row that already exists, so that nothing
 * stands between somebody and the only part that gets forgotten otherwise.
 *
 * The heading answers the one question anybody asks a cooking log, which is
 * not "when" but "how long ago".
 */
export default function Cooked({
    recipeId,
    entries,
    canLog,
    isAdmin,
    currentUserId,
    locale,
}: {
    recipeId: number;
    entries: CookedEntry[];
    canLog: boolean;
    /** An admin may take an entry down. Nobody may rewrite another's words. */
    isAdmin: boolean;
    currentUserId: number | null;
    locale: string;
}) {
    const t = useTranslations('Cooked');
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);

    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState<'preparing' | 'uploading'>('preparing');
    const [error, setError] = useState('');

    /** Which entry the file picker is currently adding to. */
    const [target, setTarget] = useState<number | null>(null);

    /** The picture being looked at whole, as [entry, index]. */
    const [viewing, setViewing] = useState<{ entry: CookedEntry; index: number } | null>(null);

    const latest = entries[0];
    const since = latest ? sinceCooked(latest.cookedAt) : null;

    const log = async () => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/cooked`, { method: 'POST' });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setError(sayable(data?.message, t('failed')));
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

    const removeEntry = async (entryId: number) => {
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

    const removePhoto = async (photoId: number) => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(
                `/api/recipes/${recipeId}/cooked/photos?photo=${photoId}`,
                { method: 'DELETE' }
            );

            if (!res.ok) setError(t('failed'));
            else router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    const upload = async (chosen: File, entryId: number | null) => {
        setBusy(true);
        setStage('preparing');
        setError('');

        try {
            // Made small here rather than sent whole: a picture straight off a
            // phone is larger than the request body a serverless function is
            // allowed to receive, and this used to fail with nothing to go on.
            // See lib/imageCompression.ts.
            const file = await compressImage(chosen);

            if (file.size > UPLOAD_LIMIT_BYTES) {
                setError(t('tooLarge'));
                return;
            }

            setStage('uploading');

            const body = new FormData();
            body.append('file', file);

            const query = entryId === null ? '' : `?entry=${entryId}`;
            const res = await fetch(`/api/recipes/${recipeId}/cooked/photos${query}`, {
                method: 'POST',
                body,
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                // A 413 can come from the platform rather than from us, and
                // then it is a page of HTML with no message in it — so the
                // status says what the body could not.
                setError(sayable(data?.message, (res.status === 413 ? t('tooLarge') : t('failed'))));
                return;
            }

            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
            setTarget(null);
            // Cleared, or picking the same file twice in a row fires no change
            // event and looks like the button has stopped working.
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    if (entries.length === 0 && !canLog) return null;

    /** One hidden file input for the whole section; `target` says where it lands. */
    const pickFile = (entryId: number | null) => {
        setTarget(entryId);
        fileInput.current?.click();
    };

    return (
        <section className="print:hidden mt-16 border-t border-line pt-8">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="font-sans text-xs font-bold uppercase tracking-widest text-muted">
                    {since ? t(`since.${since.key}`, { count: since.count }) : t('neverCooked')}
                </h2>

                {canLog && (
                    <button
                        type="button"
                        onClick={log}
                        disabled={busy}
                        className="text-sm underline underline-offset-4 disabled:opacity-50"
                    >
                        {busy && target === null ? t('logging') : t('logIt')}
                    </button>
                )}
            </div>

            {/* A failure used to be one red sentence floating between two
                headings, which read like part of the page. It is a notice now,
                and it goes away when it has been read. */}
            {error && (
                <div
                    role="alert"
                    className="mb-4 flex items-start gap-3 rounded-xl border border-danger-line bg-danger-surface p-3"
                >
                    <p className="flex-1 text-sm leading-snug text-danger">{error}</p>
                    <button
                        type="button"
                        onClick={() => setError('')}
                        className="shrink-0 text-sm font-semibold text-danger underline underline-offset-4"
                    >
                        {t('dismiss')}
                    </button>
                </div>
            )}

            {/* One line of explanation, and only while there is nothing here.
                The button says what it does; it did not say what the section
                was for, and somebody had to ask. Once there is an entry the
                entries explain themselves and this would be clutter. */}
            {entries.length === 0 && canLog && (
                <p className="mb-4 text-sm leading-snug text-muted">{t('explain')}</p>
            )}

            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                // `capture` is deliberately absent: on a phone the picker then
                // offers both the camera and the library, and the picture was
                // usually taken before anyone thought of uploading it.
                disabled={busy}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, target);
                }}
                // Opened by the "Foto hinzufügen" buttons; not a tab stop of
                // its own, and named for a screen reader that finds it anyway.
                tabIndex={-1}
                aria-label={t('add')}
                className="sr-only"
            />

            {entries.length > 0 && (
                <ol className="flex flex-col divide-y divide-line">
                    {entries.map((entry) => {
                        const mine = currentUserId !== null && entry.userId === currentUserId;

                        return (
                            <li key={entry.id} className="py-4 first:pt-0">
                                {/* The face before the name. In a list of
                                    evenings it is read first and without
                                    reading: two circles alternating says "you,
                                    her, you" at a glance, which is the
                                    question this section is usually being
                                    asked. */}
                                <p className="flex items-center gap-2.5">
                                    <Avatar
                                        name={entry.user?.name ?? null}
                                        url={entry.user?.avatarUrl ?? null}
                                        size={32}
                                    />
                                    <span className="text-xs uppercase tracking-widest text-faint">
                                        {entry.user?.name ?? t('someone')} ·{' '}
                                        {formatDate(entry.cookedAt, locale, 'short')}
                                    </span>
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

                                {entry.photos.length > 0 && (
                                    <ul className="mt-3 flex flex-wrap gap-2">
                                        {entry.photos.map((photo, index) => (
                                            <li key={photo.id} className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setViewing({ entry, index })}
                                                    aria-label={t('viewImage')}
                                                    className="block h-24 w-24 overflow-hidden rounded-xl bg-surface sm:h-28 sm:w-28"
                                                >
                                                    <Image
                                                        src={photo.url}
                                                        alt=""
                                                        width={112}
                                                        height={112}
                                                        sizes="112px"
                                                        className="h-full w-full object-cover"
                                                    />
                                                </button>

                                                {(mine || isAdmin) && (
                                                    <span className="absolute right-1 top-1">
                                                        <InlineConfirm
                                                            label="×"
                                                            confirmLabel={t('remove')}
                                                            destructive
                                                            disabled={busy}
                                                            onConfirm={() => removePhoto(photo.id)}
                                                            className={`${photoControl} h-7 w-7 text-sm leading-none`}
                                                        />
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {(mine || isAdmin) && (
                                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                                        {mine && (
                                            <button
                                                type="button"
                                                onClick={() => pickFile(entry.id)}
                                                disabled={busy}
                                                className="text-xs text-muted underline underline-offset-4 disabled:opacity-50"
                                            >
                                                {busy && target === entry.id
                                                    ? t(stage === 'preparing' ? 'preparing' : 'uploading')
                                                    : t('add')}
                                            </button>
                                        )}

                                        <InlineConfirm
                                            label={t('undoLog')}
                                            confirmLabel={t('undoLog')}
                                            destructive
                                            disabled={busy}
                                            onConfirm={() => removeEntry(entry.id)}
                                            className="text-xs text-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
                                        />
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}

            {/* One lightbox for the section, paging within the entry that was
                opened — a picture belongs to an evening, and swiping out of
                that evening into somebody else's would be a surprise. */}
            {viewing && (
                <Lightbox
                    images={viewing.entry.photos.map((photo) => photo.url)}
                    title={viewing.entry.user?.name ?? t('someone')}
                    openAt={viewing.index}
                    onIndex={(next) =>
                        setViewing((current) => (current ? { ...current, index: next } : null))
                    }
                    onClose={() => setViewing(null)}
                />
            )}
        </section>
    );
}
