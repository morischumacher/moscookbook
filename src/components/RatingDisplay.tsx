'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
    // "4,5" on a German page, not "4.5".
    const oneDecimal = new Intl.NumberFormat(useLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const tRecipe = useTranslations('Recipe');

    const [average, setAverage] = useState(initialAverage);
    const [count, setCount] = useState(initialCount);
    const [userRating, setUserRating] = useState(initialUserRating);
    /*
     * One tap on an oyster rates (the owner's wish: "Bewerten", then the
     * oysters, then a tap was a two-step for a one-step thing). At rest the
     * oysters show the average; pointed at, or focused, they show your own
     * rating and follow the pointer, and a tap saves at once.
     */
    const [pointing, setPointing] = useState(false);
    const [justSaved, setJustSaved] = useState(false);
    const saved = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (saved.current) clearTimeout(saved.current);
    }, []);

    const handleRated = (result: RatingResult) => {
        setAverage(result.average);
        setCount(result.totalRatings);
        setUserRating(result.rating);
        // Said for a moment, also on a phone, which has no pointing.
        setJustSaved(true);
        if (saved.current) clearTimeout(saved.current);
        saved.current = setTimeout(() => setJustSaved(false), 2500);
    };

    const showingYours = isLoggedIn && (pointing || justSaved);
    const yours = justSaved
        ? t('saved', { value: userRating })
        : userRating > 0
          ? t('yours', { value: userRating })
          : t('tapToRate');

    return (
        <div className={infoClassName}>
            <span
                className="inline-flex items-center gap-2"
                onPointerEnter={(event) => event.pointerType === 'mouse' && setPointing(true)}
                onPointerLeave={() => setPointing(false)}
                onFocus={() => setPointing(true)}
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPointing(false);
                }}
            >
                {isLoggedIn ? (
                    <Rating value={showingYours ? userRating : average} recipeId={recipeId} onRated={handleRated} />
                ) : (
                    <Rating value={average} readonly />
                )}

                {/* The two sentences in one cell, the longer one setting its
                    width: switching between them moved everything after it,
                    which was the jumping. No "/5" after the average: five
                    oysters say that already. */}
                <span className="grid text-muted">
                    <span className={`col-start-1 row-start-1 ${showingYours ? 'invisible' : ''}`} aria-hidden={showingYours}>
                        {t('summary', { count, average: oneDecimal.format(average) })}
                    </span>
                    {isLoggedIn && (
                        <span
                            className={`col-start-1 row-start-1 ${showingYours ? '' : 'invisible'} ${justSaved ? 'text-ink' : ''}`}
                            aria-live="polite"
                        >
                            {showingYours ? yours : t('tapToRate')}
                        </span>
                    )}
                </span>
            </span>

            {/* The dot only beside the rating: on a phone the views wrap to a
                line of their own, where a dot in front of them was a stray. */}
            <span className="whitespace-nowrap">
                <span aria-hidden="true" className="mr-5 hidden sm:inline">
                    •
                </span>
                {tRecipe('views', { count: views })}
            </span>
        </div>
    );
}
