'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Avatar from '@/components/Avatar';
import { BusyLabel } from '@/components/ui/Busy';
import { compressImage } from '@/lib/imageCompression';
import { sayable } from '@/lib/apiMessage';
import { buttonPrimary, buttonSecondary } from '@/lib/ui';

/**
 * A photo, or the initials in their circle: either is a finished answer. The
 * page left is a full load, so the new cookie is what the next page reads.
 */
export default function WelcomePicture({ name, initialUrl, next }: { name: string; initialUrl: string | null; next: string }) {
    const t = useTranslations('Welcome');
    const input = useRef<HTMLInputElement>(null);
    const [url, setUrl] = useState(initialUrl);
    const [busy, setBusy] = useState<'photo' | 'initials' | null>(null);
    const [error, setError] = useState('');

    const go = () => window.location.assign(next);

    const upload = async (chosen: File) => {
        setBusy('photo');
        setError('');
        try {
            const body = new FormData();
            body.append('file', await compressImage(chosen, 512));
            const res = await fetch('/api/account/avatar', { method: 'POST', body });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.avatarUrl) {
                setError(sayable(data?.message, t('failed')));
                return;
            }
            setUrl(data.avatarUrl);
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(null);
            if (input.current) input.current.value = '';
        }
    };

    const initials = async () => {
        setBusy('initials');
        setError('');
        const res = await fetch('/api/account/avatar', { method: 'PATCH' }).catch(() => null);
        if (res?.ok) go();
        else {
            setBusy(null);
            setError(t('failed'));
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 text-center">
            <Avatar name={name} url={url} size={120} />
            <p className="text-sm text-muted">{url ? t('looksGood') : t('preview')}</p>

            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}

            <div className="flex w-full flex-col gap-3 sm:w-auto">
                {url ? (
                    <button type="button" onClick={go} className={buttonPrimary}>
                        {t('continue')}
                    </button>
                ) : (
                    <label className={`${buttonPrimary} cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                        <BusyLabel busy={busy === 'photo'}>{t('choosePhoto')}</BusyLabel>
                        <input
                            ref={input}
                            type="file"
                            accept="image/*"
                            disabled={busy !== null}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void upload(file);
                            }}
                            className="sr-only"
                        />
                    </label>
                )}
                {url ? (
                    <label className={`${buttonSecondary} cursor-pointer`}>
                        {t('otherPhoto')}
                        <input
                            type="file"
                            accept="image/*"
                            disabled={busy !== null}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void upload(file);
                            }}
                            className="sr-only"
                        />
                    </label>
                ) : (
                    <button type="button" disabled={busy !== null} onClick={() => void initials()} className={buttonSecondary}>
                        <BusyLabel busy={busy === 'initials'}>{t('useInitials')}</BusyLabel>
                    </button>
                )}
            </div>
            <p className="text-xs text-faint">{t('later')}</p>
        </div>
    );
}
