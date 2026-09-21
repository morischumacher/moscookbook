import { put } from '@vercel/blob';
import { isSafePublicUrl } from './recipeFromHtml';
import { safeFetch } from './safeFetch';

/**
 * Copies an imported image into our own Blob store.
 *
 * Necessary, not just nice: next/image only renders hosts listed in
 * next.config, so a foreign image URL taken from an imported page would break
 * the recipe page. Mirroring also means recipes keep working when the source
 * site removes the file.
 *
 * Returns an empty string on any failure — an imported recipe without a
 * picture is fine, a failed import is not.
 */

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

const ALLOWED_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
]);

const EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
};

export async function mirrorImageToBlob(sourceUrl: string): Promise<string> {
    if (!sourceUrl || !isSafePublicUrl(sourceUrl)) return '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        // Every hop re-checked; see lib/safeFetch.
        const response = await safeFetch(sourceUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; moscookbook-import/1.0)' },
        });

        if (!response.ok) return '';

        const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_TYPES.has(contentType)) return '';

        const declaredLength = Number(response.headers.get('content-length') ?? '0');
        if (declaredLength > MAX_IMAGE_BYTES) return '';

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return '';

        const blob = await put(`imported_${Date.now()}.${EXTENSIONS[contentType]}`, buffer, {
            access: 'public',
            contentType,
        });

        return blob.url;
    } catch {
        return '';
    } finally {
        clearTimeout(timeout);
    }
}
