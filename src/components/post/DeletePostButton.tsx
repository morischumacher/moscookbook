'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';
import InlineConfirm from '@/components/ui/InlineConfirm';

export default function DeletePostButton({ postId }: { postId: number }) {
    // The entry's title used to be repeated in the question, back when the
    // question appeared in a box in the middle of the screen with no idea
    // what it had been opened from. It is asked in the row itself now, one
    // line from the title, so naming it again was only noise.
    const t = useTranslations('Blog');
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [ask, dialog] = useConfirm();

    const remove = async () => {
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
            <InlineConfirm
                label={t('delete')}
                confirmLabel={t('delete')}
                destructive
                disabled={busy}
                onConfirm={remove}
                className="text-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
            />
            {dialog}
        </>
    );
}
