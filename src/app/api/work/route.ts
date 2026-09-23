import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * The work list, public: what the admin handed over for fixing, anonymized
 * when it was shared (see lib/workItems.ts). Open items, and what was closed
 * in the last thirty days so a fixer can see what already happened.
 *
 * No account needed — that is the point of it — and nothing here that was not
 * chosen, item by item, to be here.
 */
export const dynamic = 'force-dynamic';

const ABOUT =
    "Mo's Cookbook work list. Each item was shared by the site's admin for fixing and anonymized when it was shared. " +
    'kind "capture" is an inbox import that did not read well (reason codes: src/lib/captureReasons.ts), ' +
    '"error" an error the application recorded, "ticket" a report somebody wrote. ' +
    'Refer to an item as "work #<id>" in commits and pull requests.';

export async function GET() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [open, closed] = await Promise.all([
        prisma.workItem.findMany({ where: { closedAt: null }, orderBy: { createdAt: 'asc' } }),
        prisma.workItem.findMany({ where: { closedAt: { gte: since } }, orderBy: { closedAt: 'desc' }, take: 50 }),
    ]);
    const shape = (item: (typeof open)[number]) => ({
        id: item.id,
        kind: item.kind,
        note: item.note,
        sharedAt: item.createdAt.toISOString(),
        closedAt: item.closedAt?.toISOString() ?? null,
        data: item.data,
    });

    return NextResponse.json(
        { about: ABOUT, open: open.map(shape), recentlyClosed: closed.map(shape) },
        { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
}
