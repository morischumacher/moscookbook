/**
 * Throws away every page the service worker kept for reading offline.
 *
 * Called whenever somebody signs out, in any of the three ways there are to
 * do it. The worker keeps the recipes a person opened, with their notes and
 * cook log on them, so that a kitchen with no signal still has the recipe —
 * and without this, the next person to pick up a shared tablet could switch
 * the wifi off and read them. The worker cannot tell a sign-out apart from any
 * other request, so the page that performs it does the clearing.
 *
 * `caches` is the same store from a page as from the worker. It is missing
 * outside a secure context, and quota errors are not worth failing a sign-out
 * over, so everything here is best effort.
 */
export async function forgetOfflineCopies(): Promise<void> {
    if (typeof caches === 'undefined') return;

    try {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter((name) => name.startsWith('moscookbook-'))
                .map(async (name) => {
                    // Everything but the offline page itself: the worker only
                    // puts that in when it installs, so deleting the whole
                    // cache left "no signal" as the browser's own error page
                    // until the next deploy.
                    const cache = await caches.open(name);
                    for (const request of await cache.keys()) {
                        if (new URL(request.url).pathname !== '/offline.html') await cache.delete(request);
                    }
                })
        );
    } catch {
        // Nothing to add: a cache that cannot be listed cannot be read either.
    }
}

/** What a person leaves in this browser's storage while using the site. */
const PERSONAL_KEYS = /^(moscookbook:draft:|post-draft-|moscookbook:cooking:|moscookbook:timers:|shopping-pending:|shopping-target$)/;

/**
 * Throws away what somebody left in this browser: unsaved recipe and post
 * drafts, cooking progress and timers, shopping ticks still to be sent.
 *
 * On a shared tablet the next person was offered the last one's unsaved
 * recipe — to restore and publish under their own name — and saw their
 * ticked steps and running timers. Called on signing out and on deleting the
 * account, not on the login page: somebody whose session ran out comes back
 * through it, and their unsaved draft is exactly what the draft is for.
 */
export function forgetLocalData(): void {
    for (const store of [safeStorage('local'), safeStorage('session')]) {
        if (!store) continue;
        try {
            const keys = Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key): key is string => key !== null);
            for (const key of keys) if (PERSONAL_KEYS.test(key)) store.removeItem(key);
        } catch {
            // Blocked storage: nothing was kept there either.
        }
    }
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
    try {
        return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
        return null;
    }
}

/**
 * The service worker's cache, by name. Must match `CACHE` in public/sw.js —
 * tests/offline.test.ts checks that it does.
 */
export const OFFLINE_CACHE = 'moscookbook-v2';

/**
 * Puts these pages into the offline store now, rather than when they are
 * next opened: "keep my favourites for the kitchen". Fetched one after
 * another, so a phone on a weak signal is not asked for thirty pages at once.
 * Returns how many were kept.
 */
export async function keepOffline(paths: string[], onProgress?: (done: number) => void): Promise<number> {
    if (typeof caches === 'undefined') return 0;
    const cache = await caches.open(OFFLINE_CACHE);
    let kept = 0;
    for (const path of paths) {
        try {
            const response = await fetch(path, { credentials: 'same-origin' });
            // The service worker's check (public/sw.js keep()): a deleted
            // recipe's not-found page arrives as a 200 too, and must not
            // become the copy the kitchen finds offline.
            const text = response.ok && !response.redirected ? await response.clone().text() : '';
            if (text && !/NEXT_HTTP_ERROR_FALLBACK|NEXT_REDIRECT|NEXT_NOT_FOUND|data-dgst=/.test(text)) {
                await cache.put(path, response);
                kept += 1;
            }
        } catch {
            // One page that did not come is not a reason to stop.
        }
        onProgress?.(kept);
    }
    return kept;
}
