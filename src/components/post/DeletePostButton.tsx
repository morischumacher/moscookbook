'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';

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
    const [ask, dialog] = useConfirm();

    const remove = async () => {
        const sure = await ask({
            title: t('confirmDelete', { title }),
            confirmLabel: t('delete'),
            destructive: true,
        });
        if (!sure) return;

        setBusy(true);
        try {
            const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
            if (res.ok) router.refresh();
            else await ask({ title: t('deleteFailed'), kind: 'alert' });
        } catch {
            await ask({ title: t('deleteFailed'), kind: 'alert' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="text-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
            >
                {t('delete')}
            </button>
            {dialog}
        </>
    );
}
