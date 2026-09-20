'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export default function DeleteRecipeButton({ recipeId }: { recipeId: number }) {
    const t = useTranslations('Admin');
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm(t('confirmDeleteRecipe'))) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/recipes/${recipeId}`, { method: 'DELETE' });

            if (res.ok) {
                router.refresh();
            } else {
                alert(t('deleteFailed'));
            }
        } catch (error) {
            console.error(error);
            alert(t('genericError'));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="underline underline-offset-4 hover:text-red-600 disabled:opacity-50"
        >
            {isDeleting ? t('deleting') : t('delete')}
        </button>
    );
}
