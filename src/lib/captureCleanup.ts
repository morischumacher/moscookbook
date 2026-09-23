import prisma from './prisma';
import { deleteBlobs } from './blobCleanup';

/**
 * A capture has become a recipe: its screenshots that the recipe did not
 * take are deleted, and the row stops pointing at them.
 *
 * The recipe takes one picture. The comment screenshot, the bio screenshot,
 * and the screenshot of the post when the page's own photo was used instead,
 * were kept by the capture row for ever — and a published capture's files
 * are never deleted with it, so nothing else would have.
 */
export async function releaseCaptureScreenshots(captureId: number, kept: string[]): Promise<void> {
    const capture = await prisma.capture.findUnique({
        where: { id: captureId },
        select: { imageUrl: true, moreImageUrls: true },
    });
    if (!capture) return;

    const keep = new Set(kept.filter(Boolean));
    const unused = [capture.imageUrl, ...capture.moreImageUrls].filter(
        (url): url is string => Boolean(url) && !keep.has(url as string)
    );
    if (unused.length === 0) return;

    await prisma.capture.update({
        where: { id: captureId },
        data: {
            moreImageUrls: [],
            ...(capture.imageUrl && !keep.has(capture.imageUrl) ? { imageUrl: null } : {}),
        },
    });
    await deleteBlobs(unused);
}
