import { after, NextRequest, NextResponse } from 'next/server';
import { notOurs } from '@/lib/errorNoise';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { prepareErrorReport } from '@/lib/errorReport';
import { failed } from '@/lib/reportServerError';
import { syncWorkItem, workStates } from '@/lib/workItemsDb';
import { deleteBlobs } from '@/lib/blobCleanup';
import { bulkIdsSchema, splitReports } from '@/lib/reportSections';

/**
 * Where a broken page says so.
 *
 * Unauthenticated on purpose: most failures worth knowing about happen to
 * someone who is not logged in, and an error reporter that only works for
 * admins reports the errors that are least likely to be news. That makes rate
 * limiting the whole defence, so it is strict — a report is one row and a
 * counter, nothing here is worth flooding.
 */

/** See the POST handler: the ceiling on new client errors while old ones are open. */
const MAX_OPEN_CLIENT_ERRORS = 200;

// Cut to size rather than refused, and a missing stack may be null: a
// rejected promise with no Error in it has none, and those reports were
// dropped whole — the one kind of error the admin could not otherwise see.
const reportSchema = z.object({
    message: z.string().trim().min(1).transform((text) => text.slice(0, 2000)),
    stack: z.string().nullish().transform((text) => (text ? text.slice(0, 20_000) : undefined)),
    path: z.string().nullish().transform((text) => (text ? text.slice(0, 2048) : undefined)),
});

export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'error-report'), 20, 5 * 60 * 1000);
    if (!limit.ok) {
        // 204 rather than 429: a page that is already broken should not then
        // have to handle a failure from the thing that reports failures.
        return new NextResponse(null, { status: 204 });
    }

    const parsed = reportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new NextResponse(null, { status: 204 });
    // A browser extension's error, from a page that still reports them (lib/errorNoise).
    if (notOurs(parsed.data.message, parsed.data.stack)) return new NextResponse(null, { status: 204 });

    const report = prepareErrorReport({
        source: 'client',
        message: parsed.data.message,
        stack: parsed.data.stack,
        path: parsed.data.path,
    });

    // Signed in or not decides what a report may do. Anybody's counts;
    // only a signed-in one reopens a resolved error, moves "last seen"
    // (which reopens a task reported done) and makes the error trusted —
    // a task by itself. Otherwise one anonymous POST, copied from the
    // public task list, could reopen any task at will.
    //
    // Read here, before the answer goes: the session cookie is part of the
    // request, and after() is not promised to be able to read it.
    let signedIn: boolean;
    try {
        signedIn = Boolean(await getCurrentUser());
    } catch (error) {
        failed('Could not store an error report:', error);
        return new NextResponse(null, { status: 204 });
    }

    /*
     * The storing runs after the answer has gone. The page that broke learns
     * nothing from it either way — the answer is 204 whatever happens — so a
     * visitor on a broken page was waiting on several queries and the work
     * list for no reason.
     */
    after(() => storeReport(report, signedIn));

    return new NextResponse(null, { status: 204 });
}

/** Counts, stores and hands on one report; see the POST handler. */
async function storeReport(report: ReturnType<typeof prepareErrorReport>, signedIn: boolean): Promise<void> {
    try {
        /*
         * The row keeps the words of whoever reported first. Anonymous text
         * must not reach the task list on the back of a signed-in report of
         * the same error: the fingerprint ignores quoted values and the first
         * stack line, so somebody could post that error ahead of time with
         * words of their own in exactly those places. Becoming trusted, the
         * row takes the signed-in report's words instead.
         */
        if (signedIn) {
            await prisma.errorLog.updateMany({
                where: { fingerprint: report.fingerprint, trusted: false },
                data: { message: report.message, stack: report.stack, path: report.path },
            });
        }
        // A recurrence reopens it: something marked as dealt with that is
        // still happening has not been dealt with.
        const seen = await prisma.errorLog.updateMany({
            where: { fingerprint: report.fingerprint },
            data: signedIn
                ? { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, trusted: true }
                : { count: { increment: 1 } },
        });

        /*
         * A new row only while there is room for one.
         *
         * This endpoint needs no account — a page that crashed before anybody
         * signed in still has to be able to say so — and the per-address limit
         * above does nothing against somebody with many addresses. Every
         * distinct message was a new row, so the table could be grown without
         * end and the admin's error count inflated at will. Known errors keep
         * counting; new ones stop being stored once this many are open, which
         * is far more than a working site ever has.
         */
        if (seen.count === 0) {
            // Only anonymous rows count against the room, and a signed-in
            // report is always kept: filling the table from many addresses
            // must not silence the errors real people run into.
            const open = signedIn ? 0 : await prisma.errorLog.count({ where: { source: 'client', resolvedAt: null, trusted: false } });
            if (open < MAX_OPEN_CLIENT_ERRORS) {
                await prisma.errorLog.create({ data: { ...report, trusted: signedIn } });
            }
        }

        /*
         * Onto the public work list only from somebody signed in. Anybody can
         * post here, and a work item is read by a coding agent: two identical
         * anonymous reports used to publish attacker-written text to it. An
         * anonymous report is still stored and shown to the admin, who can
         * publish it by hand.
         */
        const row = await prisma.errorLog.findUnique({ where: { fingerprint: report.fingerprint }, select: { id: true } });
        if (row && signedIn) await syncWorkItem('error', row.id);
    } catch (error) {
        // Reporting must never be the thing that breaks a page. A race between
        // two first reports of the same error lands here, and one is enough.
        failed('Could not store an error report:', error);
    }
}

/**
 * The list, for the admin screen, sorted the way it is shown
 * (lib/reportSections): what needs the admin, what is resolved, and how many
 * are with the AI — those are on the task list, not here.
 */
export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const include = { photos: { orderBy: { id: 'asc' as const }, select: { id: true, url: true } } };
    const [open, resolved] = await Promise.all([
        prisma.errorLog.findMany({ where: { resolvedAt: null }, orderBy: { lastSeenAt: 'desc' }, take: 300, include }),
        prisma.errorLog.findMany({ where: { NOT: { resolvedAt: null } }, orderBy: { lastSeenAt: 'desc' }, take: 100, include }),
    ]);

    const work = await workStates('error', open.map((row: { id: number }) => row.id));
    const sorted = splitReports([
        ...open.map((row) => ({ ...row, work: work.get(row.id) ?? null })),
        ...resolved.map((row) => ({ ...row, work: null })),
    ]);
    return NextResponse.json({ todo: sorted.todo, done: sorted.done, withAi: sorted.withAi.length });
}

const resolveSchema = bulkIdsSchema.extend({ resolved: z.boolean().default(true) });

/**
 * Marking many resolved (or back to open) in one request. One error at a
 * time is POST /api/errors/[id], which this matches.
 */
export async function PATCH(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = resolveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: 'Which ones?' }, { status: 400 });
    const { ids, resolved } = parsed.data;

    try {
        const updated = await prisma.errorLog.updateMany({ where: { id: { in: ids } }, data: { resolvedAt: resolved ? new Date() : null } });
        if (updated.count === 0) return NextResponse.json({ message: 'That is not there any more.' }, { status: 404 });
        // Dealt with here is dealt with on the work list too.
        for (const id of ids) await syncWorkItem('error', id);
        return NextResponse.json({ ok: true, updated: updated.count });
    } catch (error) {
        failed('Could not update errors:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * Deleting many for good in one request, with their screenshots' files —
 * the rows' cascade does not reach the picture store.
 */
export async function DELETE(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = bulkIdsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: 'Which ones?' }, { status: 400 });
    const { ids } = parsed.data;

    try {
        const photos = await prisma.reportPhoto.findMany({ where: { errorLogId: { in: ids } }, select: { url: true } });
        const deleted = await prisma.errorLog.deleteMany({ where: { id: { in: ids } } });
        if (deleted.count === 0) return NextResponse.json({ message: 'That is not there any more.' }, { status: 404 });
        await deleteBlobs(photos.map((photo) => photo.url));
        for (const id of ids) await syncWorkItem('error', id);
        return NextResponse.json({ ok: true, deleted: deleted.count });
    } catch (error) {
        failed('Could not delete errors:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
