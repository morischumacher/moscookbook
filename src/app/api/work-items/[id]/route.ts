import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { idFrom, route } from '@/lib/route';

type Params = { id: string };

const body = z.object({ closed: z.boolean() });

/** Done, or not done after all. */
export const PATCH = route<'admin', typeof body, Params>({ access: 'admin', body, label: 'Closing a work item' }, async ({ params, body: { closed } }) => {
    await prisma.workItem.updateMany({ where: { id: idFrom(params.id, 'work item') }, data: { closedAt: closed ? new Date() : null } });
    return NextResponse.json({ ok: true });
});

/** Taken off the public list altogether. */
export const DELETE = route<'admin', undefined, Params>({ access: 'admin', label: 'Removing a work item' }, async ({ params }) => {
    await prisma.workItem.deleteMany({ where: { id: idFrom(params.id, 'work item') } });
    return NextResponse.json({ ok: true });
});
