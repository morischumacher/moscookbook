'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Keeping what somebody has typed, in case the page goes away.
 *
 * The recipe form has done this since early on. The entry form — the one place
 * where the words are supposed to be the author's own, and therefore the one
 * place where losing them costs the most — did not. Write a long entry on a
 * phone, take a call, and Safari discards the backgrounded tab: everything
 * gone, with no warning that it could happen and no way back.
 *
 * So it is a hook rather than a second copy of the same effect. One
 * implementation means the two forms cannot drift into having different ideas
 * of when a draft is worth keeping, which is how the entry form ended up with
 * none at all.
 *
 * What it does *not* do is restore silently. A draft that reappears on its own
 * is indistinguishable from the form having saved something you did not mean to
 * save; the caller is told one exists and offers it, and the person decides.
 *
 * Everything touching localStorage is wrapped: it throws in a private window
 * and returns null with site data cleared, and a form that cannot open because
 * storage is unavailable would be a worse failure than the one this prevents.
 */

/**
 * A very small store over localStorage.
 *
 * Only what useSyncExternalStore needs: a way to subscribe, and a cached read
 * so that the snapshot is stable between notifications. React calls the
 * snapshot function often, and hitting synchronous storage on every render of
 * every form would be a cost for no reason.
 */
const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // Another tab writing the same draft is worth hearing about: two tabs on
    // one entry is how somebody loses the version they meant to keep.
    const onStorage = (event: StorageEvent) => {
        if (event.key !== null) cache.delete(event.key);
        listener();
    };

    window.addEventListener('storage', onStorage);

    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
}

function readRaw(key: string): string | null {
    if (!cache.has(key)) {
        try {
            cache.set(key, window.localStorage.getItem(key));
        } catch {
            // Private window, blocked storage. A draft is a convenience.
            cache.set(key, null);
        }
    }
    return cache.get(key) ?? null;
}

function invalidate(key: string): void {
    cache.delete(key);
    for (const listener of listeners) listener();
}

export interface LocalDraft<T> {
    /** Whether something is waiting that the caller should offer to restore. */
    found: boolean;
    /** Reads it. Null if it is gone or unreadable. */
    read: () => T | null;
    /** Throws it away — on a successful save, or when the offer is declined. */
    clear: () => void;
}

export function useLocalDraft<T>(
    key: string,
    values: T,
    /**
     * Whether there is anything worth keeping yet. An empty form saving itself
     * over a real draft is the one way this can destroy rather than protect,
     * so the caller decides what "empty" means for its own fields.
     */
    worthKeeping: boolean
): LocalDraft<T> {
    /*
     * Whether a draft exists is something only the browser knows, and the
     * server renders this form too — so it cannot simply be read during
     * render, and reading it in an effect and calling setState is a render
     * thrown away on every mount.
     *
     * useSyncExternalStore is the answer to exactly that question: a snapshot
     * for the server (there is no draft there, because there is no browser),
     * a snapshot for the client, and a way to say when it changed. The store
     * above is what `clear()` notifies, so the offer disappears the moment it
     * is answered.
     */
    const found = useSyncExternalStore(
        subscribe,
        useCallback(() => readRaw(key) !== null, [key]),
        () => false
    );

    useEffect(() => {
        if (!worthKeeping) return;

        // Nothing is written while an unanswered draft is sitting there. The
        // person has been offered a version of this entry and has not said yes
        // or no yet; overwriting it with what they are typing now would answer
        // for them, and answer wrongly — "restore" would then restore their own
        // keystrokes. Both buttons clear the offer, and saving resumes.
        if (found) return;

        // Debounced, because this runs on every keystroke and localStorage is
        // synchronous — writing a long entry on every character would be felt.
        const timer = setTimeout(() => {
            try {
                window.localStorage.setItem(key, JSON.stringify(values));
                // Deliberately not invalidating the cache: this form's own
                // typing must not make the form offer the draft back to the
                // person typing it.
            } catch {
                // Full, blocked, or a private window. Nothing to do and nothing
                // worth saying: the form still works.
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [key, values, worthKeeping, found]);

    const read = (): T | null => {
        try {
            const raw = readRaw(key);
            return raw ? (JSON.parse(raw) as T) : null;
        } catch {
            // Stored by an older version of the form, or truncated.
            return null;
        }
    };

    const clear = () => {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // Nothing there to remove, or nowhere to remove it from.
        }
        invalidate(key);
    };

    return { found, read, clear };
}
