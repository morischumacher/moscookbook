/**
 * Accepting a picture from a person.
 *
 * Split into a pure check and an impure write, because the check is the part
 * that has to be right — a size limit, a type allow-list and a filename that
 * cannot escape anywhere — and the part that is worth testing without a Blob
 * store in the room.
 *
 * Shared by the admin form and by the photos people add to a recipe they have
 * cooked, so the rules cannot drift apart between a trusted uploader and an
 * ordinary one. The size limit differs by caller; everything else does not.
 */

export const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/heic',
    'image/heif',
]);

export const ALLOWED_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'heif',
]);

export function extensionOf(filename: string): string {
    const match = /\.([a-z0-9]+)$/i.exec(filename);
    return match ? match[1].toLowerCase() : '';
}

/**
 * A filename safe to put in a URL and in a store key.
 *
 * Keeps the last hundred characters rather than the first: the end of a name
 * is where the extension and the distinguishing part live, and the front of a
 * long one is usually a camera's prefix.
 */
export function sanitizeFilename(filename: string): string {
    return (
        filename
            .replace(/[^a-zA-Z0-9._-]+/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^[._]+/, '')
            .slice(-100) || 'upload'
    );
}

export type UploadRejection = 'empty' | 'too-large' | 'unsupported-type';

export type UploadCheck =
    | { ok: true; filename: string }
    | { ok: false; reason: UploadRejection };

export function checkImageUpload(
    file: { name: string; type: string; size: number },
    maxBytes: number
): UploadCheck {
    if (file.size === 0) return { ok: false, reason: 'empty' };
    if (file.size > maxBytes) return { ok: false, reason: 'too-large' };

    const mimeAllowed = file.type ? ALLOWED_MIME_TYPES.has(file.type.toLowerCase()) : false;
    const extensionAllowed = ALLOWED_EXTENSIONS.has(extensionOf(file.name));

    // Phones often send HEIC with an empty or generic MIME type, so either
    // signal is accepted — but at least one of them is required. Trusting the
    // extension alone would accept a .jpg that is not one; trusting the type
    // alone would refuse half the pictures an iPhone sends.
    if (!mimeAllowed && !extensionAllowed) return { ok: false, reason: 'unsupported-type' };

    return { ok: true, filename: sanitizeFilename(file.name) };
}

/**
 * HEIC, detected by its container signature rather than by its name.
 *
 * An iPhone photograph arrives as HEIC, which browsers outside Safari cannot
 * display, so it is converted on the way in. The name is not evidence: the
 * same picture arrives as `.heic`, as `.jpg` and as nothing at all depending
 * on which app shared it.
 */
export function looksLikeHeic(buffer: Buffer): boolean {
    const header = buffer.subarray(0, 64);
    return (
        header.includes('ftypheic') ||
        header.includes('ftypheix') ||
        header.includes('ftyphevc') ||
        header.includes('ftypmif1')
    );
}
