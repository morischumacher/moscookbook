import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { prepareErrorReport } from '@/lib/errorReport';
import { failed } from '@/lib/reportServerError';

/**
 * Where a broken page says so.
 *
 * Unauthenticated on purpose: most failures worth knowing about happen to
 * someone who is not logged in, and an error reporter that only works for
 * admins reports the errors that are least likely to be news. That makes rate
 * limiting the whole defence, so it is strict — a report is one row and a
 * counter, nothing here is worth flooding.
 */

const reportSchema = z.object({
    message: z.string().trim().min(1).max(2000),
    stack: z.string().max(20_000).optional(),
    path: z.string().max(2048).optional(),
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
        await prisma.errorLog.upsert({
            where: { fingerprint: report.fingerprint },
            // A recurrence reopens it: something marked as dealt with that is
            // still happening has not been dealt with.
            update: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null },
            create: report,
        });
    } catch (error) {
        // Reporting must never be the thing that breaks a page.
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
    });

    return NextResponse.json({ errors });
}
