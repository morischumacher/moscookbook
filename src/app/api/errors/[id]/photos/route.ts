import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { idFrom, refuse, route } from '@/lib/route';
import { isReportPhoto } from '@/lib/blobCleanup';

type Params = { id: string };

const body = z.object({ url: z.string().max(1000) });

/**
 * A screenshot the admin attaches to an error: what it looked like. Uploaded
 * first through /api/report-photos, then tied to the error here.
 */
export const POST = route<'admin', typeof body, Params>({ access: 'admin', body, label: 'Attaching a photo to an error' }, async ({ params, body: { url } }) => {
    const errorLogId = idFrom(params.id, 'error');
    if (!isReportPhoto(url)) refuse(400, 'That picture is not a report screenshot.');
    const exists = await prisma.errorLog.findUnique({ where: { id: errorLogId }, select: { id: true } });
    if (!exists) refuse(404, 'That error is not there any more.');
    const photo = await prisma.reportPhoto.create({ data: { url, errorLogId }, select: { id: true, url: true } });
    return NextResponse.json(photo, { status: 201 });
});
