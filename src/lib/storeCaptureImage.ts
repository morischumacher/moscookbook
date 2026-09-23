import { put } from '@vercel/blob';
import { CONTENT_TYPE_OF, imageTypeOf } from './uploadImage';

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

/** Roughly 5 MB of binary once decoded — well beyond any phone screenshot. */
export const MAX_CAPTURE_IMAGE_BASE64 = 7 * 1024 * 1024;

export type StoredImage = { ok: true; url: string } | { ok: false; reason: string };

export async function storeCaptureImage(base64: string, mediaType: string): Promise<StoredImage> {
    // The declared type is not checked: the bytes decide (below). A HEIC
    // photo or a Shortcut that said png for a JPEG is not a reason to refuse.
    void mediaType;

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

    /*
     * The bytes decide, not the declared type. This is the one write path that
     * needs no session — a device token is enough — so a claim in the JSON
     * body is exactly the thing not to sign. An iPhone screenshot is a PNG
     * whatever the shortcut said; a JPEG called png is stored as the JPEG it
     * is; anything that is not a picture at all is refused before it costs a
     * blob write.
     */
    const actual = imageTypeOf(buffer);
    if (!actual) return { ok: false, reason: 'not-an-image' };

    // A capture is never converted: the model reads HEIC directly, and a
    // picture stored for a human to look at goes through the upload routes.
    const contentType = CONTENT_TYPE_OF[actual];
    const extension = actual === 'jpeg' ? 'jpg' : actual;

    try {
        const blob = await put(`capture_${Date.now()}.${extension}`, buffer, {
            access: 'public',
            contentType,
            // Not guessable from the time it was shared: a screenshot can show
            // a private chat, and two shared in one millisecond collided.
            addRandomSuffix: true,
        });

        return { ok: true, url: blob.url };
    } catch (error) {
        console.error('Storing a capture picture failed:', error);
        return { ok: false, reason: 'store-failed' };
    }
}
