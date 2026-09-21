'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes an opened recipe readable with no
 * signal. The worker itself is public/sw.js, and the reasoning — including why
 * it is network-first and how to switch it off — is written down there.
 *
 * Two deliberate choices here:
 *
 * It registers after the page has loaded rather than during it. The worker is
 * for the *next* visit, never this one, and fetching it while the first screen
 * is still being painted would make the thing it is meant to help slower.
 *
 * It fails silently. No service worker means no offline reading, which is
 * exactly where the site was before — a console error about it would be noise
 * in a browser that has made a deliberate choice, such as a private window.
 */
export default function ServiceWorker() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const register = () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {
                // Blocked, unsupported, or served without TLS in development.
            });
        };

        if (document.readyState === 'complete') {
            register();
            return;
        }

        window.addEventListener('load', register);
        return () => window.removeEventListener('load', register);
    }, []);

    return null;
}
