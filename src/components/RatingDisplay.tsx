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
    nationality: string;
    infoClassName?: string;
}

export default function RatingDisplay({ recipeId, initialAverage, initialCount, initialUserRating, isLoggedIn, views, nationality, infoClassName }: Props) {
    const [average, setAverage] = useState(initialAverage);
    const [count, setCount] = useState(initialCount);
    const [userRating, setUserRating] = useState(initialUserRating);

    const handleChange = (newRating: number) => {
        const isNew = userRating === 0;
        const newCount = isNew ? count + 1 : count;
        const oldSum = average * count;
        const newSum = oldSum - userRating + newRating;
        setAverage(newCount === 0 ? 0 : newSum / newCount);
        setUserRating(newRating);
    };

    return (
        <>
            <div className={infoClassName}>
                <span>{nationality}</span>
                <span>•</span>
                <div title={`${count} Users rated this dish with ${average.toFixed(1)}/5 Oysters`} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>
                    <Rating value={average} readonly={true} hideTitle={true} />
                    <span>({count})</span>
                </div>
                <span>•</span>
                <span>{views} views</span>
            </div>

            <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                {isLoggedIn ? (
                    <>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Your Rating:</span>
                        <Rating value={userRating} recipeId={recipeId} readonly={false} onChange={handleChange} />
                    </>
                ) : (
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral)' }}>Log in to leave a rating.</span>
                )}
            </div>
        </>
    );
}
