import { NextResponse, type NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { appVersion, peopleNames, snapshotOf } from '@/lib/workItemsDb';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import type { WorkKind } from '@/lib/workItems';

/**
 * The work list, public: what was handed over for fixing — by the admin, or
 * by the application itself for obvious failures — anonymized (see
 * lib/workItems.ts). Open items, and what closed in the last thirty days so
 * a fixer can see what already happened. Withdrawn items are never shown.
 *
 * Each open item's data is made fresh from its row on every request, so it
 * shows the row as it is now (read again, recurred, …); the stored snapshot
 * is only the fallback for a row that has since been deleted.
 */
export const dynamic = 'force-dynamic';

const ABOUT =
    "Mo's Cookbook work list. Items were shared for fixing by the site's admin, or added automatically for obvious failures (auto: true), and anonymized. " +
    'kind "capture" is an inbox import that did not read well (reason codes: src/lib/captureReasons.ts; reasonText says it in English), ' +
    '"error" an error the application recorded (count, first and last seen), "ticket" a report somebody wrote. ' +
    'appVersion is the build that was running; compare with currentVersion. ' +
    'Items close by themselves when their source is dealt with (an error resolved, a capture read correctly or taken into the cookbook, a ticket marked done); ' +
    'an error that happens again reopens its item. Do not try to close items; refer to them as "work #<id>" in commits and pull requests. ' +
    'Full instructions: docs/work-list-prompt.md in the repository.';

export async function GET(req: NextRequest) {
    // Public and uncached, and each open item is read fresh: a ceiling on how
    // often, so it cannot be used to keep the database busy.
    const limit = await rateLimitShared(clientKey(req, 'work'), 60, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json({ message: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [open, closed] = await Promise.all([
        prisma.workItem.findMany({ where: { closedAt: null, dismissedAt: null }, orderBy: { createdAt: 'asc' } }),
        prisma.workItem.findMany({ where: { closedAt: { gte: since }, dismissedAt: null }, orderBy: { closedAt: 'desc' }, take: 50 }),
    ]);

    const people = await peopleNames();
    const fresh = await Promise.all(open.map((item) => snapshotOf(item.kind as WorkKind, item.refId, item.withPhotos, { people }).catch(() => null)));

    const shape = (item: (typeof open)[number], data: unknown) => ({
        id: item.id,
        kind: item.kind,
        auto: item.auto,
        note: item.note,
        sharedAt: item.createdAt.toISOString(),
        closedAt: item.closedAt?.toISOString() ?? null,
        closedReason: item.closedReason,
        data,
    });

    return NextResponse.json(
        {
            about: ABOUT,
            currentVersion: appVersion(),
            open: open.map((item, index) => shape(item, fresh[index] ?? item.data)),
            recentlyClosed: closed.map((item) => shape(item, item.data)),
        },
        { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
}
