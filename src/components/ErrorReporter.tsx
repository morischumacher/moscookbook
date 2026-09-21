'use client';

import { useEffect } from 'react';

/**
 * Sends a client-side failure to /api/errors, once.
 *
 * `keepalive` matters: an error boundary often renders while the page is on
 * its way somewhere else, and an ordinary fetch is cancelled when that
 * happens — so the errors that mattered most would be exactly the ones never
 * reported.
 */
export default function ErrorReporter({ error }: { error: Error & { digest?: string } }) {
    useEffect(() => {
        const payload = {
            message: error.digest ? `${error.message} (digest ${error.digest})` : error.message,
            stack: error.stack,
            path: window.location.pathname,
        };

        fetch('/api/errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => {
            // Reporting is best effort. A page that is already broken must not
            // break louder because the report did not get through.
        });
    }, [error]);

    return null;
}
