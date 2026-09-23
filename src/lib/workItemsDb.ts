import prisma from './prisma';
import { draftFromJson } from './captureDraft';
import { captureSnapshot, errorSnapshot, ticketSnapshot, type WorkKind } from './workItems';

/** Every name somebody with an account goes by — what anonymize takes out. */
async function peopleNames(): Promise<string[]> {
    const users = await prisma.user.findMany({ select: { name: true, firstName: true, lastName: true } });
    return users.flatMap((user) => [user.name, user.firstName, user.lastName]);
}

/** The snapshot of one row, or null when the row is gone. */
async function snapshotOf(kind: WorkKind, refId: number): Promise<Record<string, unknown> | null> {
    const people = await peopleNames();

    if (kind === 'capture') {
        const row = await prisma.capture.findUnique({ where: { id: refId } });
        if (!row) return null;
        const draft = draftFromJson(row.draft);
        return captureSnapshot({ ...row, draft }, people);
    }
    if (kind === 'error') {
        const row = await prisma.errorLog.findUnique({ where: { id: refId } });
        return row ? errorSnapshot(row, people) : null;
    }
    const row = await prisma.ticket.findUnique({ where: { id: refId } });
    return row ? ticketSnapshot(row, people) : null;
}

/**
 * Hands a row over. Sharing the same row again refreshes its snapshot and
 * note and reopens it, rather than listing it twice.
 */
export async function publishWorkItem(kind: WorkKind, refId: number, note: string | null) {
    const data = await snapshotOf(kind, refId);
    if (!data) return null;
    return prisma.workItem.upsert({
        where: { kind_refId: { kind, refId } },
        create: { kind, refId, note, data: data as object },
        update: { note, data: data as object, closedAt: null, createdAt: new Date() },
        select: { id: true },
    });
}
