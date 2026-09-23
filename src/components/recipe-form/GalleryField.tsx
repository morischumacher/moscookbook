'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { compressImage, looksLikeImage, UPLOAD_LIMIT_BYTES } from '@/lib/imageCompression';
import { labelClass } from './formStyles';

export default function GalleryField({
    imageUrls,
    onChange,
    onError,
}: {
    imageUrls: string[];
    onChange: (next: string[]) => void;
    onError: (message: string) => void;
}) {
    const t = useTranslations('RecipeForm');
    const [uploading, setUploading] = useState(0);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    /**
     * Uploads a batch and appends what succeeded.
     *
     * The list is read from a ref rather than from `imageUrls`, because several
     * uploads finish at different moments and each would otherwise append to
     * the list as it was when the batch started — losing every picture but the
     * last.
     */
    const current = useRef(imageUrls);
    current.current = imageUrls;

    const upload = useCallback(
        async (files: File[]) => {
            // Not `type.startsWith('image/')`: an iPhone hands over a HEIC
            // with an empty type often enough that the test on its own dropped
            // real photographs without saying anything.
            const usable = files.filter(looksLikeImage);
            if (usable.length === 0) return;

            setUploading((count) => count + usable.length);
            onError('');

            for (const file of usable) {
                try {
                    const prepared = await compressImage(file);

                    // The platform refuses a request body over 4.5 MB before
                    // any of our code runs, and says so in HTML — so what came
                    // back would have been "upload failed" and nothing else.
                    if (prepared.size > UPLOAD_LIMIT_BYTES) {
                        onError(t('uploadTooLarge'));
                        continue;
                    }

                    const formData = new FormData();
                    formData.append('file', prepared);

                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    const data = await res.json();

                    if (!res.ok || !data.url) {
                        onError(data.message || t('uploadFailed'));
                    } else {
                        const next = [...current.current, data.url];
                        current.current = next;
                        onChange(next);
                    }
                } catch {
                    onError(t('uploadFailed'));
                } finally {
                    setUploading((count) => count - 1);
                }
            }
        },
        [onChange, onError, t]
    );

    // Pasting a screenshot straight into the page is the fastest path of all.
    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const files = Array.from(event.clipboardData?.files ?? []);
            if (files.some((file) => file.type.startsWith('image/'))) {
                event.preventDefault();
                upload(files);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [upload]);

    const move = (from: number, to: number) => {
        if (to < 0 || to >= imageUrls.length) return;
        const next = [...imageUrls];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange(next);
    };

    const remove = (index: number) => onChange(imageUrls.filter((_, i) => i !== index));

    return (
        <div>
            <label className={labelClass}>{t('images')}</label>

            {imageUrls.length > 0 && (
                <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {imageUrls.map((url, index) => (
                        <li key={url} className="overflow-hidden rounded-lg border border-line">
                            <div className="relative aspect-[4/3]">
                                <Image
                                    src={url}
                                    alt={t('imageNumber', { number: index + 1 })}
                                    fill
                                    className="object-cover"
                                    sizes="200px"
                                />
                                {index === 0 && (
                                    <span className="absolute left-1 top-1 rounded bg-ink px-1.5 py-0.5 text-xs text-page">
                                        {t('coverImage')}
                                    </span>
                                )}
                            </div>

                            {/* Buttons rather than drag handles: dragging a
                                thumbnail with a thumb, on a phone, inside a
                                scrolling form, is a fight nobody wins. */}
                            <div className="flex items-center justify-between px-1 py-1 text-sm">
                                <span className="flex">
                                    <button
                                        type="button"
                                        onClick={() => move(index, index - 1)}
                                        disabled={index === 0}
                                        aria-label={t('moveImageEarlier', { number: index + 1 })}
                                        className="px-2 py-1 text-muted disabled:opacity-30"
                                    >
                                        ←
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => move(index, index + 1)}
                                        disabled={index === imageUrls.length - 1}
                                        aria-label={t('moveImageLater', { number: index + 1 })}
                                        className="px-2 py-1 text-muted disabled:opacity-30"
                                    >
                                        →
                                    </button>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    aria-label={t('removeImageNumber', { number: index + 1 })}
                                    className="px-2 py-1 text-muted hover:text-danger"
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/*
                A <label> wrapping the file input, not a <div onClick>.
                The drop zone used to be a div with a click handler and a
                `display: none` input inside it — a div cannot be focused, and
                a hidden input cannot either, so adding a picture to a recipe
                was reachable with a mouse or a finger and by nothing else. A
                label is focusable through the control it labels, and `sr-only`
                keeps that control in the accessibility tree instead of
                removing it from the page.

                The drag handlers stay: dropping a file is a pointer gesture by
                nature, and nothing else depends on them.
            */}
            <label
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    upload(Array.from(event.dataTransfer.files ?? []));
                }}
                className={`block cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/20 ${dragging ? 'border-ink bg-surface' : 'border-control'
                    }`}
            >
                <p className="py-6 text-sm text-muted">
                    {uploading > 0 ? t('imageUploading') : t('imageDropHint')}
                </p>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                        upload(Array.from(event.target.files ?? []));
                        event.target.value = '';
                    }}
                />
            </label>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                {/* On a phone this opens the camera directly. */}
                <label className="cursor-pointer text-muted underline underline-offset-4 focus-within:text-ink">
                    {t('takePhoto')}
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(event) => {
                            upload(Array.from(event.target.files ?? []));
                            event.target.value = '';
                        }}
                    />
                </label>
                {uploading > 0 && <span className="text-muted">{t('imageUploading')}</span>}
            </div>
        </div>
    );
}
