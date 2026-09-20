'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'moscookbook:shopping';
const EVENT = 'moscookbook:shopping-changed';

/**
 * Which recipes are on the shopping list.
 *
 * localStorage is an external store, so it is read through
 * useSyncExternalStore rather than copied into state inside an effect: that is
 * what keeps every button and the navbar count in step, in this tab and in
 * others, without a render pass that shows stale data.
 *
 * Storage can throw or come back empty in a private window, so every access is
 * guarded; the feature degrades to "nothing selected" rather than breaking the
 * page.
 */

const EMPTY: number[] = [];

// The snapshot has to be referentially stable between reads, or React will
// re-render forever. Parsed values are cached against the raw string.
let cachedRaw: string | null = null;
let cachedIds: number[] = EMPTY;

function parse(raw: string | null): number[] {
    if (!raw) return EMPTY;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return EMPTY;
        const ids = parsed.filter((entry): entry is number => Number.isInteger(entry));
        return ids.length > 0 ? ids : EMPTY;
    } catch {
        return EMPTY;
    }
}

function getSnapshot(): number[] {
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return EMPTY;
    }

    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedIds = parse(raw);
    }

    return cachedIds;
}

/** The server knows nothing about this browser, so it renders an empty list. */
function getServerSnapshot(): number[] {
    return EMPTY;
}

function subscribe(onChange: () => void): () => void {
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

function write(ids: number[]) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
}

export function useShoppingSelection() {
    const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const toggle = useCallback((recipeId: number) => {
        const current = getSnapshot();
        write(
            current.includes(recipeId)
                ? current.filter((entry) => entry !== recipeId)
                : [...current, recipeId]
        );
    }, []);

    const clear = useCallback(() => write([]), []);

    return {
        ids,
        toggle,
        clear,
        has: (recipeId: number) => ids.includes(recipeId),
        href: ids.length > 0 ? `/shopping-list?r=${ids.join(',')}` : '/shopping-list',
    };
}
