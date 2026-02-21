'use client';

import { useState } from 'react';
import Rating from './Rating';

interface Props {
    recipeId: number;
    initialAverage: number;
    initialCount: number;
    initialUserRating: number;
    isLoggedIn: boolean;
    views: number;
    infoClassName?: string;
}

export default function RatingDisplay({ recipeId, initialAverage, initialCount, initialUserRating, isLoggedIn, views, infoClassName }: Props) {
    const [average, setAverage] = useState(initialAverage);
    const [count, setCount] = useState(initialCount);
    const [userRating, setUserRating] = useState(initialUserRating);
    const [isRatingOpen, setIsRatingOpen] = useState(false);

    const handleChange = (newRating: number) => {
        const isNew = userRating === 0;
        const newCount = isNew ? count + 1 : count;
        const oldSum = average * count;
        const newSum = oldSum - userRating + newRating;
        setAverage(newCount === 0 ? 0 : newSum / newCount);
        setUserRating(newRating);
        setIsRatingOpen(false); // Close the rating input mode
    };

    return (
        <div className={infoClassName}>

            {/* The single rating display/input */}
            <div title={isRatingOpen ? "Submit your rating" : `${count} Users rated this dish with ${average.toFixed(1)}/5 Oysters`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {isRatingOpen ? (
                    <Rating
                        value={userRating}
                        recipeId={recipeId}
                        readonly={false}
                        isInputMode={true}
                        hideTitle={true}
                        onChange={handleChange}
                    />
                ) : (
                    <Rating
                        value={average}
                        readonly={true}
                        isInputMode={false}
                        hideTitle={true}
                    />
                )}
                <span>({count})</span>
            </div>

            <span>•</span>
            <span>{views} views</span>

            {/* Inline Edit/Rate Button */}
            {isLoggedIn && !isRatingOpen && (
                <>
                    <span>•</span>
                    <button
                        onClick={() => setIsRatingOpen(true)}
                        className="text-sm font-semibold text-gray-900 dark:text-gray-300 underline decoration-1 underline-offset-4 hover:text-gray-500 transition-colors"
                    >
                        {userRating === 0 ? 'Rate' : 'Edit Rating'}
                    </button>
                </>
            )}
        </div>
    );
}
