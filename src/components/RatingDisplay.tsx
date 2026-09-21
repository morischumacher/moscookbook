'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Rating, { type RatingResult } from './Rating';

interface Props {
    recipeId: number;
    initialAverage: number;
    initialCount: number;
    initialUserRating: number;
    isLoggedIn: boolean;
    views: number;
    infoClassName?: string;
}

/**
 * The rating line under a recipe: the average, how many people, and a way in.
 *
 * It used to recompute the average itself after a vote —
 *
 *     const newSum = average * count - userRating + newRating;
 *
 * — from the numbers this component happened to be holding, while the server
 * was already returning the real average over every rating in the database.
 * Two sources for one number, and the client's one drifts the moment anyone
 * else votes. The server's numbers are used now; the arithmetic is gone.
 */
export default function RatingDisplay({
    recipeId,
    initialAverage,
    initialCount,
    initialUserRating,
    isLoggedIn,
    views,
    infoClassName,
}: Props) {
    const t = useTranslations('Rating');
    const tRecipe = useTranslations('Recipe');

    const [average, setAverage] = useState(initialAverage);
    const [count, setCount] = useState(initialCount);
    const [userRating, setUserRating] = useState(initialUserRating);
    const [isRatingOpen, setIsRatingOpen] = useState(false);

    const handleRated = (result: RatingResult) => {
        setAverage(result.average);
        setCount(result.totalRatings);
        setUserRating(result.rating);
        setIsRatingOpen(false);
    };

    return (
        <div className={infoClassName}>
            <span className="inline-flex items-center gap-2">
                {isRatingOpen ? (
                    <Rating value={userRating} recipeId={recipeId} onRated={handleRated} />
                ) : (
                    <Rating value={average} readonly />
                )}

                {/* The count in words rather than "(0)" next to five empty
                    shells, which reads as a rating of nought rather than as
                    nobody having cooked it yet. */}
                <span className="text-muted">
                    {t('summary', { count, average: average.toFixed(1) })}
                </span>
            </span>

            <span aria-hidden="true">•</span>
            <span>{tRecipe('views', { count: views })}</span>

            {isLoggedIn && !isRatingOpen && (
                <>
                    <span aria-hidden="true">•</span>
                    <button
                        type="button"
                        onClick={() => setIsRatingOpen(true)}
                        className="text-sm font-semibold text-accent-text underline decoration-1 underline-offset-4 hover:opacity-70 transition-opacity"
                    >
                        {userRating === 0 ? t('rate') : t('editRating')}
                    </button>
                </>
            )}
        </div>
    );
}
