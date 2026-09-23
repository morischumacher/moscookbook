'use client';

import { useRef, useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useTranslations } from 'next-intl';
import { uploadPicture } from '@/lib/uploadClient';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * Screenshots to send with a report: picked, uploaded straight away (shrunk
 * on the phone first), shown as thumbnails that can be taken out again.
 * The addresses go to the parent, which sends them with the report.
 */
export default function PhotoPicker({
    photos,
    onChange,
    max = 4,
}: {
    photos: string[];
    onChange: (next: string[]) => void;
    max?: number;
}) {
    const t = useTranslations('Tickets');
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState('');

    const add = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setBusy(true);
        setFailed('');
        const next = [...photos];
        for (const file of [...files].slice(0, max - photos.length)) {
            const result = await uploadPicture(file, '/api/report-photos');
            if (result.ok) next.push(result.url);
            else setFailed(result.reason === 'too-large' ? t('photoTooLarge') : sayable(result.message, t('photoFailed')));
        }
        onChange(next);
        setBusy(false);
        if (input.current) input.current.value = '';
    };

    return (
        <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-widest text-muted">{t('photosLabel')}</p>
            <p className="mb-3 text-sm text-muted">{t('photosHint')}</p>
            <div className="flex flex-wrap items-center gap-3">
                {photos.map((url) => (
                    <div key={url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail of a file just uploaded; nothing to optimise */}
                        <img src={url} alt="" className="h-20 w-20 rounded-lg border border-line object-cover" />
                        <button
                            type="button"
                            onClick={() => onChange(photos.filter((photo) => photo !== url))}
                            aria-label={t('photoRemove')}
                            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-page text-sm shadow"
                        >
                            ×
                        </button>
                    </div>
                ))}
                {photos.length < max && (
                    <label className="flex h-20 min-w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-control px-3 text-center text-sm text-muted hover:border-ink hover:text-ink">
                        <input ref={input} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void add(event.target.files)} disabled={busy} />
                        <BusyLabel busy={busy}>{t('photoAdd')}</BusyLabel>
                    </label>
                )}
            </div>
            {failed && <p className="mt-2 text-sm text-danger">{failed}</p>}
        </div>
    );
}
