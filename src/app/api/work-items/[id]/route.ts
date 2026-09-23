import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { idFrom, route } from '@/lib/route';
import { closeWorkItem, reopenWorkItem } from '@/lib/workItemsDb';

type Params = { id: string };

const body = z.object({
    closed: z.boolean().optional(),
    /** false puts a withdrawn item back on the list. */
    dismissed: z.boolean().optional(),
});

/** Done or not done; withdrawn or back. */
export const PATCH = route<'admin', typeof body, Params>({ access: 'admin', body, label: 'Changing a work item' }, async ({ params, body: change }) => {
    const id = idFrom(params.id, 'work item');
    if (change.closed === true) await closeWorkItem(id);
    if (change.closed === false) await reopenWorkItem(id);
    if (change.dismissed !== undefined) {
        await prisma.workItem.updateMany({ where: { id }, data: { dismissedAt: change.dismissed ? new Date() : null } });
    }
    return NextResponse.json({ ok: true });
});

/**
 * Taken off the public list. Kept, marked as withdrawn, so that an item the
 * application added by itself does not come straight back the next time the
 * same error happens.
 */
export const DELETE = route<'admin', undefined, Params>({ access: 'admin', label: 'Withdrawing a work item' }, async ({ params }) => {
    await prisma.workItem.updateMany({ where: { id: idFrom(params.id, 'work item') }, data: { dismissedAt: new Date() } });
    return NextResponse.json({ ok: true });
});
