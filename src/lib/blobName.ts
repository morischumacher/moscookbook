import { slugify } from './recipe';

/**
 * A stored picture's file name: what it is for and when, never the name it
 * had on somebody's phone. "IMG_4821 Hochzeit Lisa.HEIC" is private, and a
 * picture's address is public (work #20).
 *
 * blobName('cooked', 'IMG_4821.jpg') → "cooked_1728134400000.jpg";
 * blobName('picture', 'x.png', 'Agedashi Tofu') → "agedashi-tofu_1728134400000.png".
 */
export function blobName(prefix: string, filename: string, title?: string | null): string {
    const ext = /\.([a-z0-9]{2,5})$/i.exec(filename)?.[1]?.toLowerCase() ?? 'jpg';
    const named = title?.trim() ? slugify(title.trim()) : '';
    return `${named || prefix}_${Date.now()}.${ext}`;
}
