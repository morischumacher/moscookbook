import { put } from '@vercel/blob';

/**
 * A screenshot that arrived with a share, put into our own store.
 *
 * Base64 in a JSON body rather than a multipart upload, because the thing on
 * the other end is an iOS Shortcut: "Base64 Encode" is one block there, while
 * building a multipart request is not something Shortcuts can do at all. The
 * cost is a third more bytes on the wire, which for one screenshot is nothing.
 *
 * Stored before anything is read out of it. A screenshot taken in a kitchen is
 * the only copy of that moment, and losing it to a parser having a bad day
 * would be the one unforgivable failure in this whole pipeline.
 */

const EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
};

export const CAPTURE_IMAGE_TYPES = new Set(Object.keys(EXTENSIONS));

/** Roughly 5 MB of binary once decoded — well beyond any phone screenshot. */
export const MAX_CAPTURE_IMAGE_BASE64 = 7 * 1024 * 1024;

export type StoredImage = { ok: true; url: string } | { ok: false; reason: string };

export async function storeCaptureImage(base64: string, mediaType: string): Promise<StoredImage> {
    const type = mediaType.split(';')[0].trim().toLowerCase();

    if (!CAPTURE_IMAGE_TYPES.has(type)) {
        return { ok: false, reason: 'unsupported-type' };
    }

    let buffer: Buffer;
    try {
        // Shortcuts' Base64 block can wrap at 76 characters, and a data: URL
        // prefix is what arrives when somebody builds the body by hand. Both
        // are cheap to forgive and confusing to reject.
        const cleaned = base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
        buffer = Buffer.from(cleaned, 'base64');
    } catch {
        return { ok: false, reason: 'not-base64' };
    }

    if (buffer.byteLength === 0) return { ok: false, reason: 'empty' };

    try {
        const blob = await put(`capture_${Date.now()}.${EXTENSIONS[type]}`, buffer, {
            access: 'public',
            contentType: type,
        });

        return { ok: true, url: blob.url };
    } catch (error) {
        console.error('Storing a capture picture failed:', error);
        return { ok: false, reason: 'store-failed' };
    }
}
