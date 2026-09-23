import { isSafePublicUrl } from './privateAddress';
import { readCapped, safeFetch } from './safeFetch';

/**
 * Reading a picture back out of our own store, as base64.
 *
 * The capture route has the bytes in hand when a screenshot arrives, and could
 * pass them straight on. It does not, and the reason is the retry button in the
 * inbox: a capture is re-read from what was stored, so a picture that only
 * existed in the first request would be a capture that can never be retried.
 * One extra fetch of a file we just wrote is a small price for the two paths
 * being the same path.
 *
 * The same safety rule as fetchPage, for the same reason: this takes a URL, and
 * a URL taken on trust is a way to make the server fetch things on its own
 * network.
 */

const FETCH_TIMEOUT_MS = 15_000;

/** Well beyond a phone screenshot, and inside what the model will accept. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export type ImageFailure = 'unsafe-url' | 'http-error' | 'not-an-image' | 'too-large' | 'timeout';

export type FetchedImage =
    | { ok: true; base64: string; mediaType: string }
    | { ok: false; failure: ImageFailure };

export async function fetchImageAsBase64(url: string): Promise<FetchedImage> {
    if (!isSafePublicUrl(url)) return { ok: false, failure: 'unsafe-url' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        // Every hop re-checked; see lib/safeFetch.
        const response = await safeFetch(url, { signal: controller.signal });

        if (!response.ok) return { ok: false, failure: 'http-error' };

        // Only the part before the semicolon: "image/jpeg; charset=binary" is
        // nonsense a server can still send.
        const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_TYPES.has(mediaType)) return { ok: false, failure: 'not-an-image' };

        const { bytes: buffer, truncated } = await readCapped(response, MAX_IMAGE_BYTES);
        if (truncated) return { ok: false, failure: 'too-large' };

        return { ok: true, base64: buffer.toString('base64'), mediaType };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return { ok: false, failure: 'timeout' };
        }
        return { ok: false, failure: 'http-error' };
    } finally {
        clearTimeout(timer);
    }
}
