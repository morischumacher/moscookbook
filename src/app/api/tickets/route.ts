import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getCurrentUser, requireAdmin } from '@/lib/auth';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { safeTicketPath } from '@/lib/ticketPath';
import { failed } from '@/lib/reportServerError';
import { syncWorkItem, workStates } from '@/lib/workItemsDb';
import { deleteBlobs, isReportPhoto } from '@/lib/blobCleanup';
import { bulkIdsSchema, MAX_BULK, splitReports, withTheAi } from '@/lib/reportSections';

/**
 * What somebody thinks is wrong with the tool, or wants it to do.
 *
 * Writing needs an account and nothing more: everybody here is trusted, and a
 * complaint that has to be approved before it is recorded is a complaint that
 * does not get written. Reading the list is for an admin, because it is a
 * to-do list rather than a conversation.
 *
 * Deliberately not a message board. There is no reply, no thread and no
 * notification: what is being collected is a sentence somebody would otherwise
 * say in a kitchen and forget, and every affordance beyond "write it down"
 * turns that into a thing they have to keep up with.
 */

/** idea | problem | other. Three, because a chooser with eight is a form. */
const KINDS = ['idea', 'problem', 'other'] as const;

/**
 * Long enough for a paragraph, short enough that nobody writes a specification
 * into it. If something needs more room than this it needs a conversation.
 */
const MAX_BODY = 2000;

const schema = z.object({
    kind: z.enum(KINDS),
    body: z.string().trim().min(1, 'Say something').max(MAX_BODY),
    /** Where they were. See lib/ticketPath for what is refused and why. */
    path: z.string().trim().optional().transform(safeTicketPath),
    /**
     * Screenshots, already uploaded through /api/report-photos. Only
     * addresses in our own picture store are taken; anything else is
     * dropped rather than refused.
     */
    photos: z
        .array(z.string().max(1000))
        .max(4)
        .optional()
        .transform((urls) => (urls ?? []).filter(isReportPhoto)),
});

export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    // Per account: a generous limit that only a stuck submit button reaches.
    const limit = await rateLimitShared(`ticket:${user.id}`, 20, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'That is a lot at once. Try again a little later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json(
            { message: parsed.error.issues[0]?.message ?? 'That did not look right.' },
            { status: 400 }
        );
    }

    try {
        const { photos, ...fields } = parsed.data;
        const entry: { id: number; createdAt: Date } = await prisma.ticket.create({
            data: { ...fields, userId: user.id, photos: { create: photos.map((url) => ({ url })) } },
            select: { id: true, createdAt: true },
        });
        // "Etwas ist kaputt" is a task at once, like an error — whoever wrote
        // it, the admin included; an idea or anything else waits under
        // Tickets until the admin hands it over.
        await syncWorkItem('ticket', entry.id);

        /*
         * And checked, rather than trusted. syncWorkItem swallows its
         * failures (it must never break what called it), so a problem ticket
         * that did not make it onto the list used to say nothing at all —
         * the admin found out by not finding it. Now it is recorded as an
         * error, which is a task by itself, and the answer says so.
         */
        let onTaskList = false;
        if (fields.kind === 'problem') {
            onTaskList = withTheAi((await workStates('ticket', [entry.id])).get(entry.id));
            if (!onTaskList) failed('A "something is broken" ticket did not reach the task list:', new Error(`ticket ${entry.id}`));
        }

        return NextResponse.json({ ...entry, onTaskList }, { status: 201 });
    } catch (error) {
        failed('Ticket failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * The list, for whoever is going to act on it, already sorted the way it is
 * shown (lib/reportSections): what needs the admin, what is done, and how
 * many are with the AI — those are on the task list, not here.
 */
export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const select = {
        id: true,
        kind: true,
        body: true,
        path: true,
        createdAt: true,
        resolvedAt: true,
        user: { select: { name: true } },
        photos: { orderBy: { id: 'asc' as const }, select: { id: true, url: true } },
    };

    try {
        const [open, resolved] = await Promise.all([
            prisma.ticket.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: 'desc' }, take: 300, select }),
            prisma.ticket.findMany({ where: { resolvedAt: { not: null } }, orderBy: { resolvedAt: 'desc' }, take: 200, select }),
        ]);

        const work = await workStates('ticket', open.map((entry: { id: number }) => entry.id));
        const sorted = splitReports([
            ...open.map((entry) => ({ ...entry, work: work.get(entry.id) ?? null })),
            ...resolved.map((entry) => ({ ...entry, work: null })),
        ]);
        return NextResponse.json({ todo: sorted.todo, done: sorted.done, withAi: sorted.withAi.length });
    } catch (error) {
        failed('Could not read tickets:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

const resolveSchema = z.object({
    id: z.number().int().positive().max(2_147_483_647).optional(),
    ids: z.array(z.number().int().positive().max(2_147_483_647)).max(MAX_BULK).optional(),
    resolved: z.boolean().default(false),
});

/** Marking one or many dealt with, or putting them back. */
export async function PATCH(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = resolveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Which one?' }, { status: 400 });
    }
    const { id, ids, resolved: done } = parsed.data;
    const targetIds = [...new Set(ids ?? (id ? [id] : []))];

    if (targetIds.length === 0) {
        return NextResponse.json({ message: 'Which ones?' }, { status: 400 });
    }

    try {
        const updated: { count: number } = await prisma.ticket.updateMany({
            where: { id: { in: targetIds } },
            data: { resolvedAt: done ? new Date() : null },
        });

        // A stale page acting on a ticket deleted meanwhile must hear so,
        // not "success" for a change that touched nothing.
        if (updated.count === 0) {
            return NextResponse.json({ message: 'That is not there any more.' }, { status: 404 });
        }

        for (const tid of targetIds) {
            await syncWorkItem('ticket', tid);
        }

        return NextResponse.json({ success: true, updated: updated.count });
    } catch (error) {
        failed('Could not update tickets:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * Deleting tickets for good, one or many in one request — with their
 * screenshots' files, which the rows' cascade does not reach and which
 * otherwise stay in the picture store, paid for and unreachable.
 */
export async function DELETE(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = bulkIdsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Which ones?' }, { status: 400 });
    }
    const { ids } = parsed.data;

    try {
        const photos = await prisma.reportPhoto.findMany({ where: { ticketId: { in: ids } }, select: { url: true } });
        const deleted: { count: number } = await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
        if (deleted.count === 0) {
            return NextResponse.json({ message: 'That is not there any more.' }, { status: 404 });
        }
        await deleteBlobs(photos.map((photo: { url: string }) => photo.url));
        // A task made from one of them closes as "source deleted".
        for (const tid of ids) await syncWorkItem('ticket', tid);

        return NextResponse.json({ success: true, deleted: deleted.count });
    } catch (error) {
        failed('Could not delete tickets:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
