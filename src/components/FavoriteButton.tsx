'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './FavoriteButton.module.css';
import { useConfirm } from '@/components/ui/useConfirm';
import { messageFrom } from '@/lib/apiMessage';

interface FavoriteButtonProps {
    recipeId: number;
    initialFavorited: boolean;
    disabled?: boolean;
}

export default function FavoriteButton({ recipeId, initialFavorited, disabled = false }: FavoriteButtonProps) {
    const t = useTranslations('Favorite');
    const [isFavorited, setIsFavorited] = useState(initialFavorited);
    const [isLoading, setIsLoading] = useState(false);
    const [ask, dialog] = useConfirm();

    const toggleFavorite = async () => {
        if (disabled || isLoading) return;
        setIsLoading(true);

        const method = isFavorited ? 'DELETE' : 'POST';
        const previousState = isFavorited;

        // Optimistic update
        setIsFavorited(!isFavorited);

        try {
            const res = await fetch(`/api/recipes/${recipeId}/favorite`, { method });

            if (!res.ok) {
                // Revert
                setIsFavorited(previousState);
                /*
                 * Every failure is now said out loud, not only the 401.
                 * Reverting the heart without a word meant a tap that had done
                 * nothing looked exactly like a tap on an already-favourited
                 * recipe — and the next tap did nothing either.
                 */
                await ask({
                    title: res.status === 401 ? t('loginRequired') : await messageFrom(res, t('notSaved')),
                    kind: 'alert',
                });
            }
        } catch {
            // Revert
            setIsFavorited(previousState);
            await ask({ title: t('notSaved'), kind: 'alert' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
        <button
            // No `active` class any more: the state is the fill below, and
            // a class that only ever set a colour is a class that can only
            // ever set the wrong one on a photograph.
            className={styles.button}
            onClick={toggleFavorite}
            disabled={disabled}
            title={disabled ? t('loginRequired') : isFavorited ? t('remove') : t('add')}
            // A name that is not only a tooltip, and the state a screen
            // reader can say: on the favourites or not.
            aria-label={disabled ? t('loginRequired') : t('add')}
            aria-pressed={disabled ? undefined : isFavorited}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill={isFavorited ? "currentColor" : "none"}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.icon}
            >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span className={styles.srOnly}>
                {isFavorited ? t('remove') : t('add')}
            </span>
        </button>
        {dialog}
        </>
    );
}
