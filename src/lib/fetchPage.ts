import { isSafePublicUrl } from './recipeFromHtml';

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

export function normaliseUrl(input: string): string {
    const trimmed = input.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function fetchPage(rawUrl: string): Promise<FetchPageResult> {
    const url = normaliseUrl(rawUrl);

    if (!isSafePublicUrl(url)) {
        return { ok: false, failure: 'unsafe-url' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                // Some sites serve a stripped page to unknown agents.
                'User-Agent': 'Mozilla/5.0 (compatible; moscookbook-import/1.0)',
                Accept: 'text/html,application/xhtml+xml',
                // Recipes shared here are German more often than not, and a
                // site that localises will otherwise hand back English.
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
            },
        });

        if (!response.ok) {
            return { ok: false, failure: 'http-error', status: response.status };
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('html') && !contentType.includes('xml')) {
            return { ok: false, failure: 'not-a-page' };
        }

        return {
            ok: true,
            html: (await response.text()).slice(0, MAX_HTML_BYTES),
            finalUrl: response.url || url,
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return { ok: false, failure: 'timeout' };
        }
        return { ok: false, failure: 'network' };
    } finally {
        clearTimeout(timeout);
    }
}
