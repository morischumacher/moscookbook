'use client';

import { useRef, useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { looksLikeImage } from '@/lib/imageCompression';
import { uploadPicture } from '@/lib/uploadClient';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * One picture, chosen from this device.
 *
 * The blog's picture field used to be a text box asking for an `https://…`
 * address, which meant uploading the photograph somewhere else first and
 * copying a link back — nobody does that, so entries went without. This
 * uploads into our own store the same way the recipe gallery does, and shows
 * what was chosen.
 */
export default function PictureField({
    id,
    label,
    hint,
    value,
    onChange,
}: {
    id: string;
    label: string;
    hint?: string;
    value: string;
    onChange: (url: string) => void;
}) {
    const t = useTranslations('Editor');
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const take = async (file: File | undefined) => {
        if (!file || !looksLikeImage(file)) return;
        setBusy(true);
        setError('');
        const result = await uploadPicture(file);
        setBusy(false);

        if (result.ok) onChange(result.url);
        else setError(result.reason === 'too-large' ? t('uploadTooLarge') : sayable(result.message, t('uploadFailed')));
    };

    return (
        <div>
            <label htmlFor={id} className="mb-2 block text-sm font-bold uppercase tracking-widest text-muted">
                {label}
            </label>

            <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    void take(event.dataTransfer.files?.[0]);
                }}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-control p-3"
            >
                {value ? (
                    <span className="relative block h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-surface">
                        <Image src={value} alt="" fill sizes="128px" className="object-cover" />
                    </span>
                ) : (
                    <span className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg bg-surface text-xs text-faint">
                        {t('noPicture')}
                    </span>
                )}

                <div className="flex flex-col items-start gap-2 text-sm">
                    <button
                        type="button"
                        onClick={() => input.current?.click()}
                        disabled={busy}
                        className="font-medium underline underline-offset-4 disabled:opacity-50"
                    >
                        <BusyLabel busy={busy} busyText={t('uploading')}>
                            {value ? t('replacePicture') : t('choosePicture')}
                        </BusyLabel>
                    </button>
                    {value && !busy && (
                        <button
                            type="button"
                            onClick={() => onChange('')}
                            className="text-muted underline underline-offset-4 hover:text-danger"
                        >
                            {t('removePicture')}
                        </button>
                    )}
                    <span className="text-xs text-faint">{t('dropHint')}</span>
                </div>

                <input
                    ref={input}
                    id={id}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                        void take(event.target.files?.[0]);
                        event.target.value = '';
                    }}
                />
            </div>

            {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
            {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
        </div>
    );
}
