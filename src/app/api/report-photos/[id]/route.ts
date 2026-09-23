import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { idFrom, route } from '@/lib/route';
import { deleteBlobs } from '@/lib/blobCleanup';

type Params = { id: string };

/** Removing one screenshot from a ticket or an error, file and all. */
export const DELETE = route<'admin', undefined, Params>({ access: 'admin', label: 'Removing a report photo' }, async ({ params }) => {
    const photo = await prisma.reportPhoto.findUnique({ where: { id: idFrom(params.id, 'photo') }, select: { id: true, url: true } });
    if (photo) {
        await prisma.reportPhoto.delete({ where: { id: photo.id } });
        await deleteBlobs([photo.url]);
    }
    return NextResponse.json({ ok: true });
});
