'use client';

import { useEffect, useRef } from 'react';

export default function ViewTracker({ recipeId }: { recipeId: number }) {
    const hasFired = useRef(false);

    useEffect(() => {
        if (!hasFired.current) {
            hasFired.current = true;
            // Fire and forget view tracker
            fetch(`/api/recipes/${recipeId}/view`, { method: 'POST' }).catch(() => { });
        }
    }, [recipeId]);

    return null;
}
