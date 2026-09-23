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
            names.filter((name) => name.startsWith('moscookbook-')).map((name) => caches.delete(name))
        );
    } catch {
        // Nothing to add: a cache that cannot be listed cannot be read either.
    }
}
