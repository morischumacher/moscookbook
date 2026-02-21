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
    isInputMode?: boolean; // When true, uses orange filter for filling
    onChange?: (newRating: number) => void;
}

export default function Rating({ value, max = 5, recipeId, readonly = false, hideTitle = false, isInputMode = false, onChange }: RatingProps) {
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

        try {
            const res = await fetch(`/api/recipes/${recipeId}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: rating }),
            });

            if (!res.ok) {
                // Revert on failure
                setCurrentValue(previousValue);
                if (res.status === 401) {
                    alert('You must be logged in to rate recipes.');
                } else {
                    alert('Failed to submit rating.');
                }
            } else {
                if (onChange) onChange(rating); // Signal successful submission
                router.refresh();
            }
        } catch (error) {
            setCurrentValue(previousValue);
            alert('An error occurred while submitting your rating.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Calculate displayed value based on mode
    const displayValue = isInputMode ? (hoverValue !== null ? hoverValue : currentValue) : value;

    // Generate an array of length `max`
    const stars = Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;

        // Calculate how much of the current star should be filled
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
                    src="/iconv3.png"
                    alt="Empty Rating"
                    width={24}
                    height={24}
                    className={styles.emptyIcon}
                />

                {/* Foreground (Filled) Icon - clipped by CSS width */}
                {fillPercentage > 0 && (
                    <div className={styles.filledOverlay} style={{ width: `${fillPercentage}%`, zIndex: 1 }}>
                        <Image
                            src="/iconv3.png"
                            alt={isInputMode ? "Your Rating" : "Average Rating"}
                            width={24}
                            height={24}
                            className={isInputMode ? styles.orangeFilterIcon : styles.averageIcon}
                        />
                    </div>
                )}
            </div>
        );
    });

    return (
        <div className={styles.ratingWrapper} {...(hideTitle ? {} : { title: `Average: ${value.toFixed(1)}${currentValue ? `, Yours: ${currentValue}` : ''}` })}>
            {stars}
            <span className={styles.srOnly}>Average {value.toFixed(1)} out of {max}</span>
        </div>
    );
}
