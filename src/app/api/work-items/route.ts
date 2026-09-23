import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { refuse, route } from '@/lib/route';
import { WORK_KINDS, workTitle, type WorkKind } from '@/lib/workItems';
import { publishWorkItem } from '@/lib/workItemsDb';

/** The admin's view of the work list: everything, with a title per row. */
export const GET = route({ access: 'admin', label: 'Work list' }, async () => {
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
        })),
    });
});

const body = z.object({
    kind: z.enum(WORK_KINDS),
    id: z.number().int().positive(),
    note: z.string().trim().max(1000).optional().transform((value) => value || null),
});

/** "Zur Arbeitsliste": one row into the public list, anonymized. */
export const POST = route({ access: 'admin', body, label: 'Publishing a work item' }, async ({ body: { kind, id, note } }) => {
    const item = await publishWorkItem(kind, id, note);
    if (!item) refuse(404, 'That row no longer exists.');
    return NextResponse.json(item, { status: 201 });
});
