'use client';

import { useEffect } from 'react';

/**
 * The errors React's boundaries never see.
 *
 * An error boundary catches what throws during render, and that is a
 * minority of what goes wrong in a browser. A click handler that throws, a
 * `fetch` in it whose promise nobody caught, a timer, a chunk that failed to
 * load — none of those pass through a boundary, and until now none of them
 * were reported. On a client-heavy app that is most client errors.
 *
 * Two hooks: `error` for the synchronous ones and `unhandledrejection` for
 * the promises. Both post to the same reporter the boundaries use, with the
 * same `keepalive`, for the same reason.
 *
 * Twelve per page load, then silence. A page erroring in a loop would
 * otherwise burn the server's rate budget for that address on one bug and
 * crowd out the report of a different one, which the audit named as the
 * failure this cap exists for. A dozen is enough to see a loop is a loop.
 */
const MAX_PER_PAGE = 12;

function report(message: string, stack: string | null): void {
    fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, stack, path: window.location.pathname }),
        keepalive: true,
    }).catch(() => {
        // Best effort. A page that is already misbehaving must not misbehave
        // louder because the report did not get through.
    });
}

export default function GlobalErrorReporter() {
    useEffect(() => {
        let sent = 0;
        const seen = new Set<string>();

        const send = (message: string, stack: string | null) => {
            if (sent >= MAX_PER_PAGE) return;
            // The same error firing in a loop is one report here, and one row
            // with a count on the other end anyway; this saves the round trips.
            const key = `${message}\n${stack ?? ''}`;
            if (seen.has(key)) return;
            seen.add(key);
            sent += 1;
            report(message, stack);
        };

        const onError = (event: ErrorEvent) => {
            // "Script error." with no detail is what a cross-origin script
            // reports, and it says nothing worth a row.
            if (event.message === 'Script error.' && !event.error) return;
            const error = event.error instanceof Error ? event.error : null;
            send(error?.message ?? event.message ?? 'Unknown error', error?.stack ?? null);
        };

        const onRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            if (reason instanceof Error) {
                send(reason.message, reason.stack ?? null);
            } else {
                send(`Unhandled rejection: ${String(reason).slice(0, 200)}`, null);
            }
        };

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);

        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    return null;
}
