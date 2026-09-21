'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Oyster from './brand/Oyster';
import styles from './Rating.module.css';

/** What the server says after a rating is saved. Its numbers, not ours. */
export interface RatingResult {
    rating: number;
    average: number;
    totalRatings: number;
}

interface RatingProps {
    value: number;
    max?: number;
    /** Present and not readonly: the oysters can be clicked. */
    recipeId?: number;
    readonly?: boolean;
    onRated?: (result: RatingResult) => void;
}

/**
 * The oyster rating.
 *
 * Two things here were wrong in ways that do not show up until someone tries.
 *
 * The oysters were `<div onClick>`: unreachable by keyboard, invisible to a
 * screen reader, and not announced as controls. They are buttons now, which is
 * what they always were.
 *
 * And a failure used `alert()`, which stops the page dead with a browser dialog
 * to say a rating did not save. It is a line of text next to the oysters now.
 */
export default function Rating({
    value,
    max = 5,
    recipeId,
    readonly = false,
    onRated,
}: RatingProps) {
    const t = useTranslations('Rating');
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const [pending, setPending] = useState<number | null>(null);
    const [error, setError] = useState('');

    const isInteractive = Boolean(recipeId) && !readonly;

    const handleRate = async (rating: number) => {
        if (!isInteractive || pending !== null) return;

        setPending(rating);
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: rating }),
            });

            if (!res.ok) {
                setError(res.status === 401 ? t('loginRequired') : t('failed'));
                return;
            }

            const data = await res.json();

            // The server has just recomputed the average across every rating.
            // Recomputing it again here from the numbers this component happens
            // to be holding is how a displayed average drifts from the real one.
            onRated?.({
                rating: data.rating ?? rating,
                average: data.average ?? 0,
                totalRatings: data.totalRatings ?? 0,
            });
        } catch {
            setError(t('error'));
        } finally {
            setPending(null);
        }
    };

    // While choosing, the oysters follow the pointer; otherwise they show the
    // value they were given.
    const shown = hoverValue ?? pending ?? value;

    const positions = Array.from({ length: max }, (_, index) => index + 1);

    /** How much of oyster `position` is filled, 0 to 1. Averages are fractional. */
    const fillFor = (position: number) => Math.max(0, Math.min(1, shown - position + 1));

    const oysters = positions.map((position) => {
        const fill = fillFor(position);

        const shape = (
            <span className={styles.oyster}>
                <Oyster variant="outline" className={styles.empty} />
                {fill > 0 && (
                    <span className={styles.fill} style={{ width: `${fill * 100}%` }}>
                        <Oyster variant="solid" className={styles.full} />
                    </span>
                )}
            </span>
        );

        if (!isInteractive) return <span key={position}>{shape}</span>;

        return (
            <button
                key={position}
                type="button"
                onClick={() => handleRate(position)}
                onMouseEnter={() => setHoverValue(position)}
                onMouseLeave={() => setHoverValue(null)}
                onFocus={() => setHoverValue(position)}
                onBlur={() => setHoverValue(null)}
                disabled={pending !== null}
                aria-label={t('rateN', { value: position, max })}
                aria-pressed={Math.round(value) === position}
                className={styles.button}
            >
                {shape}
            </button>
        );
    });

    return (
        <span className={styles.wrapper}>
            <span
                className={styles.row}
                // One label for the group. Without it a screen reader reads five
                // decorative images and says nothing about the rating.
                {...(isInteractive
                    ? { role: 'group', 'aria-label': t('submitYours') }
                    : { role: 'img', 'aria-label': t('screenReader', { average: value.toFixed(1), max }) })}
            >
                {oysters}
            </span>

            {error && (
                <span role="alert" className={styles.error}>
                    {error}
                </span>
            )}
        </span>
    );
}
