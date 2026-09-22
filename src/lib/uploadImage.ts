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

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/heic',
    'image/heif',
]);

const ALLOWED_EXTENSIONS = new Set([
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

/* -------------------------------------------------------------------------- */
/*  What the bytes are                                                        */
/* -------------------------------------------------------------------------- */

export type ImageType = 'jpeg' | 'png' | 'gif' | 'webp' | 'avif' | 'heic';

/**
 * The type a file actually is, read from its first bytes.
 *
 * `checkImageUpload` above decides from the name and the declared type,
 * which is the right first gate — cheap, and it refuses a spreadsheet
 * before anyone reads it. It is not the last gate. The declared type is a
 * field in a multipart part header that the uploader wrote, and the
 * extension is part of a filename the uploader chose. A file called
 * `photo.jpg` containing HTML passed both and was stored under the
 * Content-Type the uploader asked for, on a route any signed-in person can
 * reach. The store is a separate origin, so the blast radius was small; it
 * was still the application signing a claim it had not checked.
 *
 * Every format here has a fixed signature. HEIC's is the ISO container
 * brand a few bytes in, which `looksLikeHeic` already read — for conversion,
 * not for admission. Now the same reading admits.
 */
export function imageTypeOf(buffer: Buffer): ImageType | null {
    if (buffer.length < 12) return null;

    const head = buffer.subarray(0, 12);

    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (head.subarray(0, 6).toString('latin1') === 'GIF87a' || head.subarray(0, 6).toString('latin1') === 'GIF89a') return 'gif';
    if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';

    // ISO base media: size (4 bytes), 'ftyp', then the brand.
    if (head.subarray(4, 8).toString('latin1') === 'ftyp') {
        const brand = buffer.subarray(8, 12).toString('latin1');
        if (brand === 'avif' || brand === 'avis') return 'avif';
        if (looksLikeHeic(buffer)) return 'heic';
    }

    return null;
}

export const CONTENT_TYPE_OF: Record<ImageType, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    heic: 'image/heic',
};

const EXTENSION_OF: Record<ImageType, string> = {
    jpeg: 'jpg',
    png: 'png',
    gif: 'gif',
    webp: 'webp',
    avif: 'avif',
    heic: 'heic',
};

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

/* -------------------------------------------------------------------------- */
/*  The bytes, ready to store                                                 */
/* -------------------------------------------------------------------------- */

export type StoredImage = {
    buffer: Buffer;
    /** The name with an extension that matches the bytes. */
    filename: string;
    /** From the bytes, never from what the uploader declared. */
    contentType: string;
};

export type NormaliseResult =
    | { ok: true; image: StoredImage }
    | { ok: false; reason: 'not-an-image' };

/**
 * A picture as it will be stored: identified by its bytes, converted if it
 * is HEIC, named to match.
 *
 * This block used to exist three times — the admin upload, the avatar, the
 * cooked-photo — identical to the character, each with its own
 * `@ts-expect-error` and its own cast. The conversion is the same act
 * wherever a picture comes in, and one copy is the number of copies that can
 * be kept right.
 */
export async function normaliseUpload(
    filename: string,
    buffer: Buffer,
    convertHeic: (buffer: Buffer) => Promise<Buffer>
): Promise<NormaliseResult> {
    const type = imageTypeOf(buffer);
    if (!type) return { ok: false, reason: 'not-an-image' };

    // The extension the uploader used, replaced with the one the bytes say.
    // `photo.jpg` that is a PNG is stored as `photo.png`, which is what it is.
    const stem = filename.replace(/\.[a-z0-9]+$/i, '');

    if (type === 'heic') {
        return {
            ok: true,
            image: {
                buffer: await convertHeic(buffer),
                filename: `${stem}.jpg`,
                contentType: 'image/jpeg',
            },
        };
    }

    return {
        ok: true,
        image: { buffer, filename: `${stem}.${EXTENSION_OF[type]}`, contentType: CONTENT_TYPE_OF[type] },
    };
}

/** The real converter, for routes. Tests pass their own. */
export async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
    const { default: convert } = await import('heic-convert');
    const converted = await convert({ buffer, format: 'JPEG', quality: 0.8 });
    return Buffer.from(converted);
}
