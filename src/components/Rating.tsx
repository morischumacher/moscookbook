'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from '@/i18n/routing';
import styles from './Rating.module.css';

interface RatingProps {
    value: number;
    max?: number;
    recipeId?: number; // If provided, the rating is interactable
    readonly?: boolean;
    hideTitle?: boolean;
    onChange?: (newRating: number) => void;
}

export default function Rating({ value, max = 5, recipeId, readonly = false, hideTitle = false, onChange }: RatingProps) {
    const [currentValue, setCurrentValue] = useState(value);
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setCurrentValue(value);
    }, [value]);

    const isInteractive = !!recipeId && !readonly;

    const handleRate = async (rating: number) => {
        if (!isInteractive || isSubmitting) return;

        setIsSubmitting(true);
        // Optimistic update
        const previousValue = currentValue;
        setCurrentValue(rating);
        if (onChange) onChange(rating);

        try {
            const res = await fetch(`/api/recipes/${recipeId}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: rating }),
            });

            if (!res.ok) {
                // Revert on failure
                setCurrentValue(previousValue);
                if (onChange) onChange(previousValue);
                if (res.status === 401) {
                    alert('You must be logged in to rate recipes.');
                } else {
                    alert('Failed to submit rating.');
                }
            } else {
                const data = await res.json();
                router.refresh();
            }
        } catch (error) {
            setCurrentValue(previousValue);
            alert('An error occurred while submitting your rating.');
        } finally {
            setIsSubmitting(false);
        }
    };
    // Generate an array of length `max`
    const stars = Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        const displayValue = hoverValue !== null ? hoverValue : currentValue;

        // Calculate how much of the current star should be filled based on the rating value.
        // E.g., if rating is 3.7 and index is 3 (the 4th star), fill is 0.7
        const fillPercentage = Math.max(0, Math.min(1, displayValue - index)) * 100;

        return (
            <div
                key={index}
                className={`${styles.starContainer} ${isInteractive ? styles.interactive : ''}`}
                onClick={() => handleRate(starValue)}
                onMouseEnter={() => isInteractive && setHoverValue(starValue)}
                onMouseLeave={() => isInteractive && setHoverValue(null)}
                style={{ cursor: isInteractive ? 'pointer' : 'default' }}
            >
                {/* Background (Empty) Icon */}
                <Image
                    src="/icon.png"
                    alt="Empty Rating"
                    width={24}
                    height={24}
                    className={styles.emptyIcon}
                />
                {/* Foreground (Filled) Icon - clipped by CSS width */}
                <div className={styles.filledOverlay} style={{ width: `${fillPercentage}%` }}>
                    <Image
                        src="/icon.png"
                        alt="Filled Rating"
                        width={24}
                        height={24}
                        className={styles.filledIcon}
                    />
                </div>
            </div>
        );
    });

    return (
        <div className={styles.ratingWrapper} {...(hideTitle ? {} : { title: `${currentValue.toFixed(1)} out of ${max}` })}>
            {stars}
            <span className={styles.srOnly}>{currentValue.toFixed(1)} out of {max}</span>
        </div>
    );
}
