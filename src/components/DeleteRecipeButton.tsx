'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import styles from '@/app/[locale]/admin/page.module.css';

export default function DeleteRecipeButton({ recipeId }: { recipeId: number }) {
    const t = useTranslations('Admin');
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm(t('confirmDeleteRecipe'))) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/recipes/${recipeId}`, {
                method: 'DELETE',
            });

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
            className={styles.deleteBtn}
            onClick={handleDelete}
            disabled={isDeleting}
        >
            {isDeleting ? t('deleting') : t('delete')}
        </button>
    );
}
