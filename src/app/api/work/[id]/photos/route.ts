import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { positiveIntId } from '@/lib/routeParams';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { workTokenValid } from '@/lib/workToken';

/**
 * A task's screenshots, for whoever works on it — with the task key.
 *
 * The public list says only how many there are (`photoCount`): a screenshot
 * can show a name, an address, a private recipe, and the list is readable by
 * anybody. But a ticket's screenshot is very often the whole of what it says
 * ("see picture"), and without it the AI working on the list was guessing
 * (work #27, #33). So the pictures are one request away for the holder of
 * the key, and for nobody else.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limit = await rateLimitShared(clientKey(req, 'work-photos'), 120, 10 * 60 * 1000);
    if (!limit.ok) return NextResponse.json({ message: 'Too many requests.' }, { status: 429 });

    if (!(await workTokenValid(req.headers.get('authorization')))) {
        return NextResponse.json({ message: 'A valid task key is needed (Authorization: Bearer …).' }, { status: 401 });
    }

    const id = positiveIntId((await params).id);
    if (id === null) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });

    const item = await prisma.workItem.findUnique({ where: { id }, select: { kind: true, refId: true, dismissedAt: true } });
    if (!item || item.dismissedAt) return NextResponse.json({ message: 'No task with that number.' }, { status: 404 });

    const select = { orderBy: { id: 'asc' as const }, select: { url: true } };
    const photos =
        item.kind === 'ticket'
            ? ((await prisma.ticket.findUnique({ where: { id: item.refId }, select: { photos: select } }))?.photos ?? [])
            : item.kind === 'error'
              ? ((await prisma.errorLog.findUnique({ where: { id: item.refId }, select: { photos: select } }))?.photos ?? [])
              : [];

    return NextResponse.json({ id, photos: photos.map((photo) => photo.url) }, { headers: { 'Cache-Control': 'no-store' } });
}
