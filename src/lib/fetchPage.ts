import { readCapped, safeFetch, UnsafeUrlError } from './safeFetch';
import { isSafePublicUrl } from './privateAddress';

/**
 * Fetching a page someone shared.
 *
 * Shared by the manual link import and the capture inbox, so the safety rules
 * cannot drift apart between them: the address is checked against
 * isSafePublicUrl first (an import must not be a way to make the server fetch
 * something on its own network), the request gives up after a while, and only
 * a bounded amount of the response is read.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;

export type FetchFailure =
    | 'unsafe-url'
    | 'http-error'
    | 'not-a-page'
    | 'timeout'
    | 'network';

export type FetchPageResult =
    | { ok: true; html: string; finalUrl: string }
    | { ok: false; failure: FetchFailure; status?: number };

function normaliseUrl(input: string): string {
    const trimmed = input.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * `json`: for a site's search API (see authorSite.ts) — the same guards, a
 * JSON answer accepted instead of a page.
 */
export async function fetchPage(rawUrl: string, options: { json?: boolean } = {}): Promise<FetchPageResult> {
    const url = normaliseUrl(rawUrl);

    if (!isSafePublicUrl(url)) {
        return { ok: false, failure: 'unsafe-url' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        // safeFetch, not fetch: a redirect used to be followed by the runtime
        // without anything checking where to. See lib/safeFetch.
        let response = await safeFetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                Accept: options.json ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            },
        });

        let wasProxied = false;
        // Optional scraping proxy fallback (e.g. ScrapingBee / FlareSolverr / custom proxy or public reader) when blocked by WAF.
        if (!response.ok && (response.status === 403 || response.status === 503)) {
            const proxyTemplate = process.env.SCRAPING_PROXY_URL || (!options.json ? 'https://r.jina.ai/{url}' : undefined);
            if (proxyTemplate) {
                try {
                    const proxyUrl = proxyTemplate.includes('{url}')
                        ? proxyTemplate.replace('{url}', encodeURIComponent(url))
                        : `${proxyTemplate}${encodeURIComponent(url)}`;
                    const proxied = await safeFetch(proxyUrl, { signal: controller.signal });
                    if (proxied.ok) {
                        response = proxied;
                        wasProxied = true;
                    }
                } catch {
                    // Fall back to original response if proxy fails
                }
            }
        }

        if (!response.ok) {
            return { ok: false, failure: 'http-error', status: response.status };
        }

        const contentType = response.headers.get('content-type') ?? '';
        const expected = options.json
            ? contentType.includes('json')
            : contentType.includes('html') || contentType.includes('xml') || contentType.includes('text/plain') || contentType.includes('text/markdown');
        if (!expected) {
            return { ok: false, failure: 'not-a-page' };
        }

        return {
            ok: true,
            // Cut rather than refused: a recipe is near the top of its page,
            // and what is past four megabytes is comments and scripts.
            html: new TextDecoder().decode((await readCapped(response, MAX_HTML_BYTES)).bytes),
            finalUrl: wasProxied ? url : (response.url || url),
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return { ok: false, failure: 'timeout' };
        }
        // A redirect that pointed somewhere private is refused rather than
        // reported as a network blip, so the inbox says what actually happened.
        if (error instanceof UnsafeUrlError) {
            return { ok: false, failure: 'unsafe-url' };
        }
        return { ok: false, failure: 'network' };
    } finally {
        clearTimeout(timeout);
    }
}
