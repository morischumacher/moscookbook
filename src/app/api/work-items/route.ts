import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { WORK_KINDS, workTitle, type WorkKind } from '@/lib/workItems';
import { publishWorkItem, syncAll } from '@/lib/workItemsDb';

/**
 * Catching up walks every open error and capture, a few queries each: worth
 * doing now and then, not on every visit and every click on this page.
 */
const CATCH_UP_EVERY_MS = 10 * 60 * 1000;
let caughtUpAt = 0;

/** The admin's view of the work list: everything, with a title per row. */
export const GET = route({ access: 'admin', label: 'Work list' }, async () => {
    // Catch up what was already there before items were added automatically.
    if (Date.now() - caughtUpAt > CATCH_UP_EVERY_MS) {
        caughtUpAt = Date.now();
        await syncAll();
    }
    const items = await prisma.workItem.findMany({ orderBy: [{ dismissedAt: { sort: 'asc', nulls: 'first' } }, { closedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], take: 200 });
    return NextResponse.json({
        items: items.map((item) => ({
            id: item.id,
            kind: item.kind,
            note: item.note,
            title: workTitle(item.kind as WorkKind, item.data as Record<string, unknown>),
            createdAt: item.createdAt.toISOString(),
            closedAt: item.closedAt?.toISOString() ?? null,
            closedReason: item.closedReason,
            auto: item.auto,
            dismissed: item.dismissedAt !== null,
            doneAt: item.doneAt?.toISOString() ?? null,
            doneNote: item.doneNote,
            doneRef: item.doneRef,
        })),
    });
});

const body = z.object({
    kind: z.enum(WORK_KINDS),
    id: z.number().int().positive().max(2_147_483_647),
    note: z.string().trim().max(1000).optional().transform((value) => value || null),
    /** Publish the item's screenshots with it. */
    withPhotos: z.boolean().default(false),
});

/** "Zur Arbeitsliste": one row into the public list, anonymized. */
export const POST = route({ access: 'admin', body, label: 'Publishing a work item' }, async ({ body: { kind, id, note, withPhotos } }) => {
    const item = await publishWorkItem(kind, id, note, withPhotos);
    if (!item) refuse(404, 'That row no longer exists.');
    return NextResponse.json(item, { status: 201 });
});
