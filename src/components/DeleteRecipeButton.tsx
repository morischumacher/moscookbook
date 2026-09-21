'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';

export default function DeleteRecipeButton({ recipeId }: { recipeId: number }) {
    const t = useTranslations('Admin');
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [ask, dialog] = useConfirm();

    const handleDelete = async () => {
        const sure = await ask({
            title: t('confirmDeleteRecipe'),
            confirmLabel: t('delete'),
            destructive: true,
        });
        if (!sure) return;

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
            <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="underline underline-offset-4 hover:text-danger disabled:opacity-50"
            >
                {isDeleting ? t('deleting') : t('delete')}
            </button>
            {dialog}
        </>
    );
}
