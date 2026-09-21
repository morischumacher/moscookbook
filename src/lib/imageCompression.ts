/**
 * Making a photograph small enough to send, in the browser, before sending it.
 *
 * Two bugs were sitting in here, and they only showed up on a phone: adding a
 * picture worked from a laptop and failed with "that did not work" from an
 * iPhone.
 *
 * The first was the line below that used to say *HEIC cannot be decoded by
 * browsers; the server converts it* — and returned the file untouched. It is
 * true of Chrome on a desktop. It is false of Safari on an iPhone, which is
 * the only thing that produces HEIC in the first place, because there it is
 * the system's own format. So the one file that most needed shrinking was the
 * one file that was handed on at full size.
 *
 * The second was arithmetic nobody had done: the server said it accepted 10 MB
 * (15 on the admin form), but a serverless function is handed at most 4.5 MB of
 * request body and the platform refuses the rest above our heads — as a page of
 * HTML, not as a reason, which is why the failure had nothing to say. A 12
 * megapixel photograph never had a chance.
 *
 * Both are fixed by the same thing: decode the picture here, on the device that
 * can decode it, and send a JPEG about a thousand pixels wide. Nothing on this
 * site displays an image larger than that, so the full-size original was only
 * ever paying for storage and for seconds spent watching a progress bar on a
 * train.
 *
 * Everything fails softly. A browser that cannot decode the file returns the
 * original and the server's converter does what it always did.
 */

/**
 * What the request body may weigh: under the platform's 4.5 MB, with room for
 * the multipart envelope. The routes enforce the same number.
 */
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

/** Twice the widest a picture is ever displayed, which is what a retina screen wants. */
export const MAX_DIMENSION = 2000;

const QUALITY = 0.85;

/**
 * Below this a file is left alone: re-encoding a small PNG as JPEG would cost
 * it its transparency and gain nothing.
 */
const LEAVE_ALONE_BYTES = 1_000_000;

export function isProbablyHeic(file: { type: string; name: string }): boolean {
    return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Whether a file picker's result is worth offering at all.
 *
 * Not `type.startsWith('image/')`: an iPhone hands over a HEIC with an empty
 * type often enough that the test on its own drops real photographs on the
 * floor without saying anything. The name is allowed to be the evidence when
 * the type declines to be.
 */
export function looksLikeImage(file: { type: string; name: string }): boolean {
    return (
        file.type.startsWith('image/') ||
        /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(file.name)
    );
}

/** The long edge fitted to `maxEdge`, keeping the proportions. Never enlarges. */
export function fittedSize(
    width: number,
    height: number,
    maxEdge: number
): { width: number; height: number } {
    const longest = Math.max(width, height);
    if (longest <= maxEdge || longest === 0) {
        return { width: Math.round(width), height: Math.round(height) };
    }

    const scale = maxEdge / longest;
    // At least one pixel each way: a 4000×3 panorama would otherwise round its
    // height to zero and produce an empty canvas.
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/**
 * Whether it is worth re-encoding, from what is known before the file is
 * decoded. A HEIC always is — the point there is the format rather than the
 * size, and the device holding it is the one that can convert it. An animated
 * GIF never is, since a canvas keeps one frame of it.
 */
export function worthCompressing(file: { size: number; type: string; name: string }): boolean {
    if (file.size === 0) return false;
    if (file.type === 'image/gif') return false;
    if (isProbablyHeic(file)) return true;
    return file.size > LEAVE_ALONE_BYTES;
}

/** A bitmap of the file, by whichever route this browser offers. */
async function decode(file: File): Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
    release: () => void;
}> {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            release: () => bitmap.close(),
        };
    }

    // Older Safari has no createImageBitmap but does have an <img> that can
    // load a HEIC, so the fallback is not decoration.
    const url = URL.createObjectURL(file);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new window.Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('The browser could not read that picture.'));
            element.src = url;
        });

        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            release: () => URL.revokeObjectURL(url),
        };
    } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
}

/**
 * The same picture, small enough to send — or the original, if this browser
 * could not manage it. Never throws: an upload that could not be made smaller
 * is still an upload worth attempting.
 */
export async function compressImage(file: File): Promise<File> {
    if (!looksLikeImage(file)) return file;
    if (!worthCompressing(file)) return file;

    let decoded: Awaited<ReturnType<typeof decode>> | null = null;

    try {
        decoded = await decode(file);

        const { width, height } = fittedSize(decoded.width, decoded.height, MAX_DIMENSION);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) return file;

        context.drawImage(decoded.source, 0, 0, width, height);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', QUALITY);
        });

        if (!blob) return file;

        // A photograph almost always shrinks; a small flat graphic re-encoded
        // as JPEG can grow. Keep whichever is smaller — unless the original is
        // a format half the world cannot display, where any JPEG is progress.
        if (!isProbablyHeic(file) && blob.size >= file.size) return file;

        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name || 'photo.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch {
        return file;
    } finally {
        decoded?.release();
    }
}
