/**
 * Shrinks a photo in the browser before uploading it.
 *
 * Phone cameras produce 4–8 MB files; recipe pages never need more than about
 * 2000px, so this cuts upload time on mobile data dramatically. Always
 * fail-safe: if anything goes wrong, the original file is returned and the
 * server handles it as before.
 */

const MAX_DIMENSION = 2000;
const QUALITY = 0.85;

function isProbablyHeic(file: File): boolean {
    return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export async function compressImage(file: File): Promise<File> {
    // HEIC cannot be decoded by browsers; the server converts it.
    if (isProbablyHeic(file)) return file;
    if (!file.type.startsWith('image/')) return file;
    if (file.type === 'image/gif') return file; // would lose animation
    if (typeof createImageBitmap !== 'function') return file;

    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

        // Already small enough and not huge on disk — leave it alone.
        if (scale === 1 && file.size < 1_500_000) {
            bitmap.close();
            return file;
        }

        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) {
            bitmap.close();
            return file;
        }

        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', QUALITY);
        });

        if (!blob || blob.size >= file.size) return file;

        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    } catch {
        return file;
    }
}
