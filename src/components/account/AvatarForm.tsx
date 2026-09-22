'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import Avatar from '@/components/Avatar';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { compressImage } from '@/lib/imageCompression';

/**
 * Choosing the picture, and seeing it straight away.
 *
 * The circle on this page is the same component that draws it everywhere else,
 * at the size it is actually used plus a large one — so what you are looking
 * at while you decide is what other people will see, not a preview of it.
 *
 * Shrunk to 512 pixels before sending. A photograph off a phone is several
 * thousand wide and this is painted at forty; uploading the original would
 * cost the upload, the storage and the bandwidth of every page that shows it,
 * for detail no screen will ever draw.
 */
export default function AvatarForm({
    name,
    initialUrl,
}: {
    name: string;
    initialUrl: string | null;
}) {
    const t = useTranslations('Account');
    const router = useRouter();
    const input = useRef<HTMLInputElement>(null);

    const [url, setUrl] = useState(initialUrl);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const upload = async (chosen: File) => {
        setBusy(true);
        setError('');

        try {
            const file = await compressImage(chosen, 512);

            const body = new FormData();
            body.append('file', file);

            const res = await fetch('/api/account/avatar', { method: 'POST', body });
            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.avatarUrl) {
                setError(data?.message || t('failed'));
                return;
            }

            setUrl(data.avatarUrl);
            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
            // Cleared, or picking the same file twice fires no change event
            // and the button looks broken.
            if (input.current) input.current.value = '';
        }
    };

    const remove = async () => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch('/api/account/avatar', { method: 'DELETE' });
            if (!res.ok) {
                setError(t('failed'));
                return;
            }
            setUrl(null);
            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-5">
            <Avatar name={name} url={url} size={72} />

            <div className="flex flex-col gap-2">
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}

                <p className="flex flex-wrap items-center gap-4">
                    <label className={`cursor-pointer text-sm underline underline-offset-4 ${busy ? 'opacity-50' : ''}`}>
                        {busy ? t('working') : url ? t('replace') : t('choose')}
                        <input
                            ref={input}
                            type="file"
                            accept="image/*"
                            disabled={busy}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void upload(file);
                            }}
                            className="sr-only"
                        />
                    </label>

                    {url && (
                        <InlineConfirm
                            label={t('remove')}
                            confirmLabel={t('remove')}
                            destructive
                            disabled={busy}
                            onConfirm={remove}
                            className="text-sm text-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
                        />
                    )}
                </p>
            </div>
        </div>
    );
}
