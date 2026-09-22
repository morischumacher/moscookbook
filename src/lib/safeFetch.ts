import { lookup } from 'node:dns/promises';
import { isSafePublicUrl } from './privateAddress';
import { isPrivateAddress } from './privateAddress';

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
 * The hostname is resolved as well, at every hop. A name is not an address:
 * `https://recipes.example` passes every text test there is and can have an A
 * record pointing at 10.0.0.5 — which is a domain anybody can register, so the
 * text test alone stops somebody typing an address and nothing else.
 *
 * What remains, and cannot be closed without replacing the HTTP agent: between
 * the name being resolved here and the runtime resolving it again to open the
 * connection, an answer with a one-second lifetime can change. Closing that
 * means pinning the connection to the address that was checked, which Node's
 * fetch does not offer. Written down rather than left as a silent gap; the
 * attack it leaves needs control of a DNS server and a race against a request
 * that has already been made.
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

/**
 * Refuses a host whose name resolves to somewhere private.
 *
 * Every address is checked, not the first: a name can answer with several, and
 * one private answer among them is an open door.
 *
 * A name that will not resolve is allowed through, because a fetch to it is
 * about to fail anyway and failing at the fetch says something truer than
 * "refused" would.
 */
async function resolvesPublicly(hostname: string): Promise<boolean> {
    /*
     * A literal address is checked here, not waved through.
     *
     * The old line said "already checked by isSafePublicUrl" and returned true
     * for anything with a colon in it. That was only ever true for IPv4 —
     * `isSafePublicUrl` knew one IPv6 address, `::1`, so `http://[fd00::1]/`
     * and `http://[::ffff:7f00:1]/` passed the textual check *and* skipped
     * this one, and were fetched. Two checks each assuming the other had done
     * the work is zero checks.
     *
     * Now both ask the same range tables. Asking twice costs nothing and means
     * a hop that redirects to a literal is caught here even if it was never
     * seen as text.
     */
    const bare = hostname.replace(/^\[|\]$/g, '');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(':')) {
        return !isPrivateAddress(bare);
    }

    try {
        const answers = await lookup(hostname, { all: true });
        return !answers.some((answer) => isPrivateAddress(answer.address, answer.family));
    } catch {
        return true;
    }
}

export async function safeFetch(
    target: string,
    options: SafeFetchOptions = {}
): Promise<Response> {
    const { signal, headers, maxRedirects = MAX_REDIRECTS } = options;

    let url = target;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
        if (!isSafePublicUrl(url)) throw new UnsafeUrlError(url);

        // The name, not only the text. See resolvesPublicly.
        if (!(await resolvesPublicly(new URL(url).hostname))) {
            throw new UnsafeUrlError(url);
        }

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
