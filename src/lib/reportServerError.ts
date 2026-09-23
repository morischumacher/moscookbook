import { after } from 'next/server';
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

/**
 * What a route's catch block calls.
 *
 * `console.error(label, error)` stays — the platform log is still where the
 * full stack is read when somebody is looking — and the same failure is
 * recorded where somebody will *see* it. Fire-and-forget: the response goes
 * out at once, and a reporter that could not write says so in the log and
 * nowhere else.
 *
 * `label` is the human name of the operation ("Delete user error") and
 * becomes the path column, because a server error has no page and the label
 * is what tells two of them apart on the list.
 */
export function failed(label: string, error: unknown): void {
    console.error(label, error);

    /*
     * Inside `after()`, where there is a request to attach it to.
     *
     * A bare `void` promise is not waited for by anything, and on a serverless
     * function the instance can be frozen the moment the response has gone —
     * which is exactly when an error handler has just sent its 500. The write
     * to the error log was the part most likely to be cut off, on the very
     * requests it exists for. `after()` keeps the function alive for it.
     * Outside a request (a script, a test) there is nothing to attach to and
     * `after` throws, so it falls back to the old way.
     */
    try {
        after(() => reportServerError(error, { path: label }));
    } catch {
        void reportServerError(error, { path: label });
    }
}
