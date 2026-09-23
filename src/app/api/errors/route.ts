import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { prepareErrorReport } from '@/lib/errorReport';
import { failed } from '@/lib/reportServerError';
import { syncWorkItem, workStates } from '@/lib/workItemsDb';

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

    const report = prepareErrorReport({
        source: 'client',
        message: parsed.data.message,
        stack: parsed.data.stack,
        path: parsed.data.path,
    });

    try {
        // A recurrence reopens it: something marked as dealt with that is
        // still happening has not been dealt with.
        const seen = await prisma.errorLog.updateMany({
            where: { fingerprint: report.fingerprint },
            data: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null },
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
            const open = await prisma.errorLog.count({ where: { source: 'client', resolvedAt: null } });
            if (open < MAX_OPEN_CLIENT_ERRORS) {
                await prisma.errorLog.create({ data: report });
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
        if (row && (await getCurrentUser())) await syncWorkItem('error', row.id);
    } catch (error) {
        // Reporting must never be the thing that breaks a page. A race between
        // two first reports of the same error lands here, and one is enough.
        failed('Could not store an error report:', error);
    }

    return new NextResponse(null, { status: 204 });
}

/** The list, for the admin screen. */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const showResolved = new URL(req.url).searchParams.get('resolved') === 'true';

    const errors = await prisma.errorLog.findMany({
        where: showResolved ? { NOT: { resolvedAt: null } } : { resolvedAt: null },
        orderBy: { lastSeenAt: 'desc' },
        take: 100,
        include: { photos: { orderBy: { id: 'asc' }, select: { id: true, url: true } } },
    });

    // Beside each row: whether it is on the work list.
    const work = await workStates('error', errors.map((row: { id: number }) => row.id));
    return NextResponse.json({ errors: errors.map((row: { id: number }) => ({ ...row, work: work.get(row.id) ?? null })) });
}
