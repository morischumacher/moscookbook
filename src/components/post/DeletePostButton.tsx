'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export default function DeletePostButton({
    postId,
    title,
}: {
    postId: number;
    /** Named in the question, because a list of entries all look alike. */
    title: string;
}) {
    const t = useTranslations('Blog');
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (!confirm(t('confirmDelete', { title }))) return;

        setBusy(true);
        try {
            const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
            if (res.ok) router.refresh();
            else alert(t('deleteFailed'));
        } catch {
            alert(t('deleteFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
        >
            {t('delete')}
        </button>
    );
}
