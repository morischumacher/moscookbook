'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { compressImage, UPLOAD_LIMIT_BYTES } from '@/lib/imageCompression';

export interface CookedPhoto {
    id: number;
    url: string;
    caption: string | null;
    createdAt: Date;
    userId: number | null;
    user: { name: string } | null;
}

/**
 * "Nachgekocht" — what the dish looked like when other people made it.
 *
 * The only place in this cookbook where a guest puts something on a page
 * everybody sees, and the reason it is worth the trouble: a recipe with three
 * pictures from three kitchens says more about whether it works than any
 * amount of styling.
 *
 * One button, no form. Picking a photograph *is* the action — a file field
 * followed by a "save" step would be two taps for a thing nobody hesitates
 * about. The caption comes afterwards, as a line under the picture that is
 * already up: optional in the way an optional field should be, where skipping
 * it costs nothing because there is nothing to skip.
 */
export default function CookedPhotos({
    recipeId,
    photos,
    canAdd,
    isAdmin,
    currentUserId,
    locale,
}: {
    recipeId: number;
    photos: CookedPhoto[];
    canAdd: boolean;
    isAdmin: boolean;
    /** Decides which pictures are this person's to caption or remove. */
    currentUserId: number | null;
    locale: string;
}) {
    const t = useTranslations('Cooked');
    const router = useRouter();
    const input = useRef<HTMLInputElement>(null);

    const [busy, setBusy] = useState(false);
    /** What the button says while it works — preparing, then uploading. */
    const [stage, setStage] = useState<'preparing' | 'uploading'>('preparing');
    const [error, setError] = useState('');

    const dateFormatter = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const upload = async (chosen: File) => {
        setBusy(true);
        setStage('preparing');
        setError('');

        try {
            // Made small here rather than sent whole: a picture straight off
            // a phone is larger than the request body the server is allowed to
            // receive, and this used to fail with nothing to go on. See
            // lib/imageCompression.ts.
            const file = await compressImage(chosen);

            if (file.size > UPLOAD_LIMIT_BYTES) {
                setError(t('tooLarge'));
                return;
            }

            setStage('uploading');

            const body = new FormData();
            body.append('file', file);

            const res = await fetch(`/api/recipes/${recipeId}/photos`, { method: 'POST', body });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                // A 413 can come from the platform rather than from us, and
                // then it is a page of HTML with no message in it — so the
                // status says what the body could not.
                setError(data?.message || (res.status === 413 ? t('tooLarge') : t('failed')));
                return;
            }

            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
            // Cleared, or picking the same file twice in a row fires no change
            // event and looks like the button has stopped working.
            if (input.current) input.current.value = '';
        }
    };

    const caption = async (photoId: number, text: string) => {
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/photos?photo=${photoId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption: text }),
            });

            if (!res.ok) setError(t('failed'));
            else router.refresh();
        } catch {
            setError(t('failed'));
        }
    };

    const remove = async (photoId: number) => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/photos?photo=${photoId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                setError(t('failed'));
                return;
            }

            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    if (photos.length === 0 && !canAdd) return null;

    return (
        <section className="print:hidden mt-16 border-t border-line pt-8">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                    {t('title')}
                </h2>

                {canAdd && (
                    <>
                        <label
                            className={`cursor-pointer text-sm underline underline-offset-4 ${busy ? 'opacity-50' : ''
                                }`}
                        >
                            {busy ? t(stage === 'preparing' ? 'preparing' : 'uploading') : t('add')}
                            <input
                                ref={input}
                                type="file"
                                accept="image/*"
                                // capture is deliberately absent: on a phone the
                                // picker then offers both the camera and the
                                // library, and the picture was usually taken
                                // before anyone thought of uploading it.
                                disabled={busy}
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) void upload(file);
                                }}
                                className="sr-only"
                            />
                        </label>
                    </>
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
                        aria-label={t('dismiss')}
                        className="-m-1 shrink-0 rounded p-1 text-danger transition-opacity hover:opacity-60"
                    >
                        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                            <path
                                d="M4 4l8 8M12 4l-8 8"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>
            )}

            {photos.length === 0 ? (
                <p className="text-sm text-muted">{t('empty')}</p>
            ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((photo) => {
                        // By id, not by name: two people in one household can
                        // share a first name, and this decides who may delete
                        // what.
                        const mine = currentUserId !== null && photo.userId === currentUserId;

                        return (
                            <li key={photo.id} className="flex flex-col">
                                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface">
                                    <Image
                                        src={photo.url}
                                        alt={photo.caption ?? ''}
                                        fill
                                        sizes="(min-width: 640px) 220px, 45vw"
                                        className="object-cover"
                                    />
                                </div>

                                <p className="mt-2 text-xs text-faint">
                                    {photo.user?.name ?? t('someone')} ·{' '}
                                    {dateFormatter.format(photo.createdAt)}
                                </p>

                                {mine ? (
                                    <input
                                        type="text"
                                        defaultValue={photo.caption ?? ''}
                                        placeholder={t('captionPlaceholder')}
                                        aria-label={t('captionLabel')}
                                        maxLength={140}
                                        disabled={busy}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') event.currentTarget.blur();
                                        }}
                                        // Saved when the field is left, not on
                                        // every keystroke: a note is a sentence
                                        // somebody is still writing until they
                                        // stop.
                                        onBlur={(event) => {
                                            const next = event.target.value.trim();
                                            if (next !== (photo.caption ?? '')) {
                                                void caption(photo.id, next);
                                            }
                                        }}
                                        // 16px, or iOS Safari zooms the page in
                                        // when the field takes focus.
                                        className="mt-1 w-full border-0 bg-transparent p-0 text-base leading-snug text-muted outline-none placeholder:text-faint focus:text-ink"
                                    />
                                ) : (
                                    photo.caption && (
                                        <p className="mt-1 text-sm leading-snug text-muted">
                                            {photo.caption}
                                        </p>
                                    )
                                )}

                                {(mine || isAdmin) && (
                                    <span className="mt-1 self-start">
                                        <InlineConfirm
                                            label={t('remove')}
                                            confirmLabel={t('remove')}
                                            destructive
                                            disabled={busy}
                                            onConfirm={() => remove(photo.id)}
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
