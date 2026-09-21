import prisma from './prisma';
import { prepareErrorReport } from './errorReport';

/**
 * Records a server-side failure alongside the client ones.
 *
 * Vercel keeps runtime logs, but reading them means going and looking, and
 * nobody goes and looks. This puts a server error on the same page as the
 * client errors, which is a page there is a reason to open.
 *
 * Never throws. A route handler that is already failing must not then fail
 * differently because the reporter did.
 */
export async function reportServerError(
    error: unknown,
    context: { path?: string } = {}
): Promise<void> {
    try {
        const report = prepareErrorReport({
            source: 'server',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
            path: context.path ?? null,
        });

        await prisma.errorLog.upsert({
            where: { fingerprint: report.fingerprint },
            update: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null },
            create: report,
        });
    } catch (reportingError) {
        console.error('Could not store a server error report:', reportingError);
    }
}
