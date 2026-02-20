'use client';

import { useState } from 'react';
import styles from './FavoriteButton.module.css';

interface FavoriteButtonProps {
    recipeId: number;
    initialFavorited: boolean;
    disabled?: boolean;
}

export default function FavoriteButton({ recipeId, initialFavorited, disabled = false }: FavoriteButtonProps) {
    const [isFavorited, setIsFavorited] = useState(initialFavorited);
    const [isLoading, setIsLoading] = useState(false);

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
                if (res.status === 401) {
                    alert('You must be logged in to favorite recipes.');
                }
            }
        } catch (error) {
            // Revert
            setIsFavorited(previousState);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            className={`${styles.button} ${isFavorited ? styles.active : ''}`}
            onClick={toggleFavorite}
            disabled={disabled}
            title={disabled ? 'Log in to favorite' : 'Toggle Favorite'}
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
                {isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            </span>
        </button>
    );
}
