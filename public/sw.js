/**
 * Reading a recipe with no signal.
 *
 * The practical case, and the reason this is worth any risk at all: a kitchen
 * with bad wifi, a recipe already open, and a page that reloads into nothing
 * because somebody walked past the router. A service worker keeps the last
 * copy of every page that has actually been visited and serves it when the
 * network will not answer.
 *
 * A service worker is also the one piece of a website that can break it
 * permanently — it outlives a deploy, it is not cleared by a refresh, and a
 * bad one serves a stale site to somebody with no way to say otherwise. So
 * everything here is written to fail towards the network:
 *
 * - **Network first, always.** The cache is only ever consulted when a request
 *   fails. Nothing stale is ever preferred to something fresh, which means a
 *   deploy is live the moment it lands, exactly as it was before this file.
 * - **One file is precached, and it is the one that has to exist before the
 *   network fails**: /offline.html, the page shown when somebody asks for an
 *   address they have never opened. Everything else is only kept once it has
 *   actually been visited, so this cannot serve a page that never worked.
 * - **One cache, versioned.** Bump VERSION and every old cache is deleted on
 *   the next activation.
 * - **A kill switch.** Publishing this file with DISABLED = true makes the
 *   worker unregister itself and throw its caches away on the next visit.
 *   That is the escape hatch, and it is here because a service worker with no
 *   escape hatch is not a feature, it is a hostage situation.
 *
 * What is deliberately not cached: anything under /api, anything that is not a
 * GET, and any page that requires being signed in to be *correct*. The last
 * one is not enforceable from here — the server decides — which is why a
 * cached page is only ever shown when the network has already failed, where
 * the alternative is a blank screen rather than a different page.
 */

const DISABLED = false;

const VERSION = 'v1';
const CACHE = `moscookbook-${VERSION}`;

/** Roughly a cookbook's worth of pages and pictures, not a mirror of the site. */
const MAX_ENTRIES = 120;

const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
    // No waiting: a new worker should take over at the next navigation rather
    // than after every tab has been closed, or a fix ships and nobody gets it.
    self.skipWaiting();

    event.waitUntil(
        (async () => {
            if (DISABLED) return;

            try {
                const cache = await caches.open(CACHE);
                // Only this. It is the page for "you have never opened this
                // address and there is no network", so waiting for somebody to
                // visit it first would mean it is never there when it is
                // needed. Tested by taking the server away and asking for a
                // page that was never opened.
                await cache.add(OFFLINE_PAGE);
            } catch {
                // Installing must not fail over this: without it the worker
                // still serves every page anybody has actually opened, which
                // is the part that matters.
            }
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            if (DISABLED) {
                const names = await caches.keys();
                await Promise.all(names.map((name) => caches.delete(name)));
                await self.registration.unregister();
                return;
            }

            const names = await caches.keys();
            await Promise.all(
                names
                    .filter((name) => name.startsWith('moscookbook-') && name !== CACHE)
                    .map((name) => caches.delete(name))
            );

            await self.clients.claim();
        })()
    );
});

/** Oldest out first, so the cache cannot grow without end. */
async function trim(cache) {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;

    // The offline page is never evicted: it is the one entry whose whole job
    // is to be there when nothing else is.
    const evictable = keys.filter((key) => !new URL(key.url).pathname.endsWith(OFFLINE_PAGE));

    for (const key of evictable.slice(0, evictable.length - MAX_ENTRIES)) {
        await cache.delete(key);
    }
}

function isCacheable(request, url) {
    if (request.method !== 'GET') return false;
    if (url.origin !== self.location.origin) return false;

    // The API is the live state of the cookbook. A cached answer to "who am I"
    // or "what is in the inbox" is worse than no answer.
    if (url.pathname.startsWith('/api/')) return false;

    return true;
}

self.addEventListener('fetch', (event) => {
    if (DISABLED) return;

    const { request } = event;
    const url = new URL(request.url);

    if (!isCacheable(request, url)) return;

    event.respondWith(
        (async () => {
            try {
                const response = await fetch(request);

                // Only a real answer is worth keeping. A 404, a redirect to
                // the login form, or an error page cached is a bug that
                // outlives the deploy that caused it.
                if (response.ok && response.status === 200) {
                    const copy = response.clone();
                    const cache = await caches.open(CACHE);
                    await cache.put(request, copy);
                    await trim(cache);
                }

                return response;
            } catch (error) {
                // The network failed. This is the entire point of the file.
                const cached = await caches.match(request);
                if (cached) return cached;

                // A navigation with nothing cached: say so in the site's own
                // words rather than showing the browser's dinosaur.
                if (request.mode === 'navigate') {
                    const offline = await caches.match(OFFLINE_PAGE);
                    if (offline) return offline;
                }

                throw error;
            }
        })()
    );
});
