'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';
import InlineConfirm from '@/components/ui/InlineConfirm';

export default function DeleteRecipeButton({ recipeId }: { recipeId: number }) {
    const t = useTranslations('Admin');
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [ask, dialog] = useConfirm();

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/recipes/${recipeId}`, { method: 'DELETE' });

            if (res.ok) {
                router.refresh();
            } else {
                await ask({ title: t('deleteFailed'), kind: 'alert' });
            }
        } catch (error) {
            console.error(error);
            await ask({ title: t('genericError'), kind: 'alert' });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <InlineConfirm
                label={isDeleting ? t('deleting') : t('delete')}
                confirmLabel={t('delete')}
                destructive
                disabled={isDeleting}
                onConfirm={handleDelete}
                className="underline underline-offset-4 hover:text-danger disabled:opacity-50"
            />
            {dialog}
        </>
    );
}
