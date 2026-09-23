import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { idFrom, refuse, route } from '@/lib/route';
import { closeWorkItem, confirmWorkDone, rejectWorkDone, reopenWorkItem } from '@/lib/workItemsDb';
import { rereadInBackground } from '@/lib/captureBackground';

type Params = { id: string };

const body = z.object({
    closed: z.boolean().optional(),
    /** false puts a withdrawn item back on the list. */
    dismissed: z.boolean().optional(),
    /** The admin's answer to "reported done": true closes it, false sends it back. */
    confirm: z.boolean().optional(),
    /** Why it is not done, when sending it back. */
    why: z.string().trim().max(1000).optional(),
});

/** Done or not done; withdrawn or back. */
export const PATCH = route<'admin', typeof body, Params>({ access: 'admin', body, label: 'Changing a work item' }, async ({ params, body: change }) => {
    const id = idFrom(params.id, 'work item');
    if (change.confirm === true) {
        // Closed, and the error or ticket with it; an inbox item is read
        // again, so the fix shows on it without anybody pressing a button.
        const item = await confirmWorkDone(id);
        if (!item) refuse(409, 'That task is no longer waiting for a confirmation.');
        if (item.kind === 'capture') await rereadInBackground(item.refId);
    }
    if (change.confirm === false && !(await rejectWorkDone(id, change.why ?? null))) {
        refuse(409, 'That task is no longer waiting for a confirmation.');
    }
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
