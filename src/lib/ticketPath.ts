import { withoutLinkTokens } from './linkTokens';

/**
 * The page a ticket came from, made safe to store.
 *
 * It arrives in a query string, which means it arrives from whoever asked for
 * the page — so it is treated as input rather than as something the
 * application said to itself.
 *
 * Three things are refused, and the third is the one worth spelling out:
 *
 * 1. Anything that is not a path of our own. `//elsewhere.test` is a
 *    protocol-relative URL; stored and later rendered as a link, it points
 *    somewhere else entirely. `https://…` the same, and a backslash is a path
 *    separator to some browsers and not to the URL parser, which is the gap
 *    `/\evil.test` is built to fall through.
 *
 * 2. Anything unreasonably long. A path is a path; 300 characters of one is
 *    somebody trying something.
 *
 * 3. **The query string, always.** The most sensitive thing this application
 *    produces is `?token=` — a reset link is as good as a password for the
 *    hour it lives — and a ticket is written to a row an admin reads later. A
 *    field that copies whatever was in the address bar into permanent storage
 *    will eventually copy that.
 *
 * Shared between the browser and the route on purpose: two copies of a rule
 * about what is safe to store is how the copies come to disagree, and the one
 * that matters is always the one nobody looked at.
 */
export function safeTicketPath(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.length > 300) return null;
    if (!value.startsWith('/')) return null;
    if (value.startsWith('//')) return null;
    if (value.startsWith('/\\')) return null;

    // Everything from the first `?` or `#`, gone. Not sanitised, not
    // inspected — removed, because nothing in it is worth the risk of getting
    // the inspection wrong.
    const path = withoutLinkTokens(value.split(/[?#]/)[0]);

    return path === '' ? null : path;
}
