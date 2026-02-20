'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import styles from '@/app/[locale]/admin/page.module.css';

export default function DeleteRecipeButton({ recipeId }: { recipeId: number }) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this recipe?')) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/recipes/${recipeId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                router.refresh();
            } else {
                alert('Failed to delete recipe');
            }
        } catch (error) {
            console.error(error);
            alert('An error occurred');
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
            {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
    );
}
