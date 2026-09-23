'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { uploadPicture } from '@/lib/uploadClient';
import { BusyLabel } from '@/components/ui/Busy';

export interface ReportPhoto {
    id: number;
    url: string;
}

/**
 * The screenshots on a ticket or an error, for the admin: open one full
 * size, take one away, and — on an error, which nobody sent a picture with —
 * attach one.
 */
export default function ReportPhotos({
    photos: initial,
    attachTo,
}: {
    photos: ReportPhoto[];
    /** The error to attach new screenshots to; without it, none can be added. */
    attachTo?: number;
}) {
    const t = useTranslations('Reports');
    const [photos, setPhotos] = useState(initial);
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    const remove = async (id: number) => {
        const res = await fetch(`/api/report-photos/${id}`, { method: 'DELETE' }).catch(() => null);
        if (res?.ok) setPhotos((current) => current.filter((photo) => photo.id !== id));
    };

    const add = async (files: FileList | null) => {
        if (!files?.length || attachTo === undefined) return;
        setBusy(true);
        for (const file of [...files].slice(0, 4)) {
            const uploaded = await uploadPicture(file, '/api/report-photos');
            if (!uploaded.ok) continue;
            const res = await fetch(`/api/errors/${attachTo}/photos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: uploaded.url }),
            }).catch(() => null);
            if (res?.ok) {
                const photo: ReportPhoto = await res.json();
                setPhotos((current) => [...current, photo]);
            }
        }
        setBusy(false);
        if (input.current) input.current.value = '';
    };

    if (photos.length === 0 && attachTo === undefined) return null;

    return (
        <div className="mt-3 flex flex-wrap items-center gap-3">
            {photos.map((photo) => (
                <div key={photo.id} className="relative">
                    <a href={photo.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a small admin thumbnail */}
                        <img src={photo.url} alt={t('photoAlt')} className="h-16 w-16 rounded-lg border border-line object-cover" />
                    </a>
                    <button
                        type="button"
                        onClick={() => void remove(photo.id)}
                        aria-label={t('photoRemove')}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-page text-xs shadow"
                    >
                        ×
                    </button>
                </div>
            ))}
            {attachTo !== undefined && (
                <label className="cursor-pointer text-sm text-muted underline underline-offset-4 hover:text-ink">
                    <input ref={input} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void add(event.target.files)} disabled={busy} />
                    <BusyLabel busy={busy}>{t('photoAttach')}</BusyLabel>
                </label>
            )}
        </div>
    );
}
