import { isSafePublicUrl } from './recipeFromHtml';

/**
 * Fetching a URL somebody else chose, without following it somewhere private.
 *
 * `isSafePublicUrl` checks the address it is handed, and that was the whole
 * check — every fetcher then passed `redirect: 'follow'`. A public host that
 * answers `302 → http://169.254.169.254/latest/meta-data/` was followed without
 * anything looking at the new address, and the body came back into a draft an
 * admin then reads. That is a readable request to the inside of the network
 * from the outside, and it needed no account: `/api/capture` reaches it with a
 * capture token.
 *
 * So redirects are followed here, one at a time, with the same check applied at
 * every hop. Nothing else changes for the callers — they get a Response, or an
 * error saying where it stopped.
 *
 * What this still does not do is resolve the hostname. A name whose A record
 * points at 10.0.0.5 passes every test above, because the test is on the text
 * of the address. Closing that properly means resolving and pinning the
 * address, which Node's fetch does not offer without a custom agent; it is
 * written down here rather than left as a silent gap.
 */

const MAX_REDIRECTS = 5;

export class UnsafeUrlError extends Error {
    constructor(public readonly url: string) {
        super(`Refused to follow ${url}`);
        this.name = 'UnsafeUrlError';
    }
}

export interface SafeFetchOptions {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    /** How many hops to follow before giving up. */
    maxRedirects?: number;
}

export async function safeFetch(
    target: string,
    options: SafeFetchOptions = {}
): Promise<Response> {
    const { signal, headers, maxRedirects = MAX_REDIRECTS } = options;

    let url = target;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
        if (!isSafePublicUrl(url)) throw new UnsafeUrlError(url);

        const response = await fetch(url, {
            signal,
            headers,
            // The point of the whole file: the redirect comes back to us rather
            // than being followed by the runtime behind our back.
            redirect: 'manual',
        });

        const status = response.status;
        const isRedirect = status === 301 || status === 302 || status === 303 ||
            status === 307 || status === 308;

        if (!isRedirect) return response;

        const location = response.headers.get('location');
        if (!location) return response;

        // Resolved against the address we actually asked, so a relative
        // Location — which is legal and common — lands where the server meant.
        try {
            url = new URL(location, url).toString();
        } catch {
            throw new UnsafeUrlError(location);
        }

        // The body of a redirect is nothing anybody wants, and leaving it
        // unread keeps the connection from being held open.
        await response.body?.cancel().catch(() => undefined);
    }

    throw new UnsafeUrlError(`${target} (too many redirects)`);
}
