import { after } from 'next/server';
import prisma from './prisma';
import type { ClassifiedCapture } from './capture';
import { processCapture } from './captureProcess';
import { siteLearning } from './siteProfileDb';
import { aiCapability } from './aiConfig';
import { mirrorImageToBlob } from './mirrorImage';
import { toJsonObject } from './json';
import { failed } from './reportServerError';
import { usageRecorder } from './tokenUsageDb';
import { syncWorkItem } from './workItemsDb';

/**
 * Reads a capture that has just been stored, after the answer has gone.
 *
 * Moved out of the capture route so the share page (Android and desktop's
 * "Share to…", see app/[locale]/share) reads what arrives exactly the same
 * way as a shortcut or a forwarded mail does.
 */
export function readInBackground(captureId: number, classified: ClassifiedCapture, imageUrl?: string): void {
    const capture = { id: captureId };
    after(async () => {
        try {
            // Read here rather than inside the pipeline: `captureProcess` must
            // not import Prisma, because the test suite imports `captureProcess`.
            // With the stored address put back on it.
            //
            // The second half of the same bug: classification happens before the
            // upload, so `classified.imageUrl` is null for a screenshot, and
            // handing that to the pipeline made it answer "No picture was stored"
            // about a picture that had just been stored perfectly.
            const ai = await aiCapability();
            const usage = usageRecorder('capture', { captureId: capture.id, source: classified.source });
            const learning = usageRecorder('learn', { captureId: capture.id, source: classified.source });
            const result = await processCapture(
                { ...classified, imageUrl: imageUrl ?? classified.imageUrl },
                ai,
                {
                    onModel: usage.report,
                    onLearn: learning.report,
                    ...siteLearning(ai),
                }
            );
            await Promise.all([usage.flush(), learning.flush()]);

            // Foreign image hosts are rejected by next/image, so the picture is
            // copied into our own store rather than kept as a link that will not
            // render.
            const draft =
                result.draft && result.draft.imageUrl
                    ? { ...result.draft, imageUrl: await mirrorImageToBlob(result.draft.imageUrl) }
                    : result.draft;

            await prisma.capture.update({
                where: { id: capture.id },
                data: {
                    status: result.status,
                    error: result.error,
                    readBy: result.readBy,
                    aiProvider: result.provider,
                    // Widened before storing: see src/lib/json.ts, and
                    // tests/prismaJsonCompat.ts for why the compiler insists.
                    draft: draft ? toJsonObject(draft) : undefined,
                    imageUrl: draft?.imageUrl || imageUrl || null,
                    processedAt: new Date(),
                },
            });
            // An obvious failure goes onto the work list by itself.
            await syncWorkItem('capture', capture.id);
        } catch (error) {
            failed('Capture was saved but could not be read:', error);

            await prisma.capture
                .updateMany({
                    where: { id: capture.id },
                    data: {
                        status: 'failed',
                        error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
                        processedAt: new Date(),
                    },
                })
                .catch(() => undefined);
        }
    });
}
