import { del } from '@vercel/blob';

/**
 * Deleting the file behind a row.
 *
 * Until this existed, deleting a recipe deleted its `Image` rows and left every
 * file sitting in the Blob store for ever. Nothing broke — the pictures simply
 * became unreachable and kept being paid for, and the bill is the only place
 * that would ever have mentioned it.
 *
 * Two rules, both of which matter:
 *
 * **Only our own files.** A recipe imported from a website can hold a link to
 * someone else's server, and `del` on a URL we do not own would at best fail
 * and at worst be a request we had no business making. Only URLs on the Blob
 * host are touched.
 *
 * **Never throws.** Deleting a recipe must succeed even when the store is
 * having a bad afternoon. A file left behind is a small cost; a delete that
 * fails halfway leaves a recipe that is half gone, which is a real one. The
 * sweep script is how anything missed is caught later.
 */

/** Vercel Blob serves from *.public.blob.vercel-storage.com. */
function isOurs(url: string): boolean {
    try {
        const { hostname, protocol } = new URL(url);
        return protocol === 'https:' && hostname.endsWith('.public.blob.vercel-storage.com');
    } catch {
        return false;
    }
}

export function ownBlobUrls(urls: (string | null | undefined)[]): string[] {
    return [...new Set(urls.filter((url): url is string => Boolean(url) && isOurs(url!)))];
}

/**
 * Returns how many were deleted, and never rejects.
 *
 * `del` takes a list, so one call covers a recipe's whole gallery. A store that
 * refuses the batch is logged and forgotten: the point of this function is that
 * its caller does not have to think about it.
 */
export async function deleteBlobs(urls: (string | null | undefined)[]): Promise<number> {
    const ours = ownBlobUrls(urls);
    if (ours.length === 0) return 0;

    try {
        await del(ours);
        return ours.length;
    } catch (error) {
        console.error(`Could not delete ${ours.length} blob(s):`, error);
        return 0;
    }
}
