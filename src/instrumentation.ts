import type { Instrumentation } from 'next';

/**
 * Errors thrown while rendering a page, into the same log as everything else.
 *
 * `failed()` records what a route handler catches. What nobody catches — a
 * server component that throws, a query that fails halfway through drawing a
 * page — went to the platform's console and nowhere the admin ever looks. The
 * error page said "something went wrong" and the error log said nothing had.
 *
 * Imported lazily and only on Node: this file is loaded by every runtime, and
 * the database client is not something the others can load.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    // Redirects and not-found are thrown on purpose and are not errors.
    const digest =
        typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : '';
    if (digest.startsWith('NEXT_')) return;

    const { reportServerError } = await import('./lib/reportServerError');
    await reportServerError(error, { path: request.path });
};
