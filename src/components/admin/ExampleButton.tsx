'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * "Show me an example": makes the example entry or collection (once) and
 * opens it in its editor, where every feature can be seen in use.
 */
export default function ExampleButton({ kind }: { kind: 'post' | 'collection' }) {
    const t = useTranslations('Examples');
    const locale = useLocale();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const make = async () => {
        setBusy(true);
        setFailed(false);
        try {
            const res = await fetch('/api/examples', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, locale }),
            });
            const data: { id?: number } = await res.json().catch(() => ({}));
            if (!res.ok || !data.id) {
                setFailed(true);
                return;
            }
            router.push(kind === 'post' ? `/admin/posts/${data.id}` : `/admin/collections/${data.id}`);
            router.refresh();
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <p className="mt-4 text-sm text-muted">
            <button
                type="button"
                onClick={() => void make()}
                disabled={busy}
                className="underline underline-offset-4 hover:text-ink disabled:opacity-50"
            >
                <BusyLabel busy={busy}>{kind === 'post' ? t('post') : t('collection')}</BusyLabel>
            </button>
            {failed && <span className="ml-2 text-danger">{t('failed')}</span>}
        </p>
    );
}
