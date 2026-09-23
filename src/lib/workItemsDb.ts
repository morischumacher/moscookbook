import prisma from './prisma';
import en from '../../messages/en.json';
import { draftFromJson } from './captureDraft';
import { readReason } from './captureReasons';
import { aiCapability } from './aiConfig';
import { hostOf } from './siteProfile';
import { anonymize, captureSnapshot, errorSnapshot, ticketSnapshot, type WorkKind } from './workItems';
import { captureIsObvious, errorIsObvious } from './workAuto';

/**
 * The work list's side of the database: snapshots, and keeping each item in
 * step with the row it was made from.
 *
 * Nothing here may break what called it. Every entry point is used from a
 * path that matters more — recording an error, reading a capture, marking a
 * ticket done — so failures are logged and swallowed.
 */

/** How long after a "done" report the same error still counts as the old build's. */
const RECURRENCE_GRACE_MS = 60 * 60 * 1000;

/** A note stays readable: the newest part of it, when it has grown long. */
function capNote(note: string | null): string | null {
    if (!note) return note;
    return note.length > 2000 ? `…${note.slice(-2000)}` : note;
}

/** Which build the site is running; lets a fixer tell "fixed since" from "still broken". */
export function appVersion(): string {
    return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';
}

/**
 * Every name somebody here goes by — what anonymize takes out. Each word of
 * the full name too (an account from before first and last names were
 * separate has only that), and the names on open invitations.
 */
export async function peopleNames(): Promise<string[]> {
    const [users, invites] = await Promise.all([
        prisma.user.findMany({ select: { name: true, firstName: true, lastName: true } }),
        prisma.invite.findMany({ where: { usedAt: null }, select: { firstName: true, lastName: true } }),
    ]);
    return [
        ...users.flatMap((user) => [user.name, user.firstName, user.lastName, ...user.name.split(/\s+/)]),
        ...invites.flatMap((invite) => [invite.firstName ?? '', invite.lastName ?? '']),
    ].filter(Boolean);
}

/** A reason code as an English sentence, for a reader who does not have the messages. */
function reasonText(error: string | null): string | null {
    const coded = readReason(error);
    if (!coded) return error;
    const reasons = en.Inbox.reason as Record<string, string>;
    const failures = en.Inbox.fetchFailure as Record<string, string>;
    const detail = coded.detail ? (failures[coded.detail] ?? coded.detail) : '';
    return (reasons[coded.code] ?? coded.code).replace('{detail}', detail);
}

/** The snapshot of one row, with everything a fixer needs, or null when the row is gone. */
export async function snapshotOf(
    kind: WorkKind,
    refId: number,
    withPhotos = false,
    // Passed in by a caller making many snapshots, so the names are read once.
    known?: { people: string[] }
): Promise<Record<string, unknown> | null> {
    const people = known?.people ?? (await peopleNames());
    const version = appVersion();

    if (kind === 'capture') {
        const row = await prisma.capture.findUnique({ where: { id: refId } });
        if (!row) return null;
        const draft = draftFromJson(row.draft);
        const host = row.sourceUrl ? hostOf(row.sourceUrl) : null;
        const [profile, ai] = await Promise.all([
            host ? prisma.siteProfile.findUnique({ where: { host }, select: { learnedAt: true, usedAt: true, failures: true } }) : null,
            aiCapability().catch(() => null),
        ]);
        const base = captureSnapshot({ ...row, draft }, people);
        return {
            ...base,
            reasonText: row.error ? anonymize(reasonText(row.error) ?? '', people) : null,
            draft: base.draft && draft
                ? {
                      ...base.draft,
                      servings: draft.servings,
                      prepMinutes: draft.prepMinutes,
                      cookMinutes: draft.cookMinutes,
                      category: draft.category,
                      cuisine: draft.nationality,
                  }
                : base.draft,
            // What the importer knew about the site, and what it was allowed to do.
            siteProfile: host ? (profile ? { host, learnedAt: profile.learnedAt, lastUsedAt: profile.usedAt, failures: profile.failures } : { host, learned: false }) : null,
            aiMode: ai ? { mode: ai.mode, keyConfigured: ai.keys.length > 0 } : null,
            appVersion: version,
        };
    }
    /*
     * Screenshots: how many there are, always; the pictures themselves only
     * when the admin ticked "with photos" when sharing. A screenshot can
     * show a name, an address, a private recipe — whatever was on screen.
     */
    const photos = (list: { url: string }[]) =>
        withPhotos ? { photos: list.map((photo) => photo.url) } : { photoCount: list.length };

    if (kind === 'error') {
        const row = await prisma.errorLog.findUnique({ where: { id: refId }, include: { photos: { orderBy: { id: 'asc' }, select: { url: true } } } });
        return row ? { ...errorSnapshot(row, people), ...photos(row.photos), resolved: row.resolvedAt !== null, appVersion: version } : null;
    }
    const row = await prisma.ticket.findUnique({ where: { id: refId }, include: { photos: { orderBy: { id: 'asc' }, select: { url: true } } } });
    return row ? { ...ticketSnapshot(row, people), ...photos(row.photos), resolved: row.resolvedAt !== null, appVersion: version } : null;
}

/**
 * Hands a row over by hand. Sharing again refreshes the snapshot and note,
 * reopens it, and undoes an earlier "take off the list".
 */
export async function publishWorkItem(kind: WorkKind, refId: number, note: string | null, withPhotos = false) {
    const data = await snapshotOf(kind, refId, withPhotos);
    if (!data) return null;
    return prisma.workItem.upsert({
        where: { kind_refId: { kind, refId } },
        create: { kind, refId, note, withPhotos, data: data as object },
        update: { note, withPhotos, data: data as object, closedAt: null, closedReason: null, dismissedAt: null, auto: false, createdAt: new Date(), doneAt: null, doneNote: null, doneRef: null },
        select: { id: true },
    });
}

/** Off the public list, and it stays off — also for the automatic ones. */
export async function withdrawWorkItem(kind: WorkKind, refId: number) {
    await prisma.workItem.updateMany({ where: { kind, refId }, data: { dismissedAt: new Date() } });
}

/**
 * "Erledigt" on the work list. For an error or a ticket that means the row
 * itself is dealt with too — one decision, not two places to make it. A
 * recurring error reopens both (see syncWorkItem).
 */
export async function closeWorkItem(id: number, reason: 'done' | 'confirmed' = 'done') {
    const item = await prisma.workItem.update({ where: { id }, data: { closedAt: new Date(), closedReason: reason } });
    if (item.kind === 'error') await prisma.errorLog.updateMany({ where: { id: item.refId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (item.kind === 'ticket') await prisma.ticket.updateMany({ where: { id: item.refId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    return item;
}

export async function reopenWorkItem(id: number) {
    const item = await prisma.workItem.update({ where: { id }, data: { closedAt: null, closedReason: null, doneAt: null, doneNote: null, doneRef: null } });
    if (item.kind === 'ticket') await prisma.ticket.updateMany({ where: { id: item.refId }, data: { resolvedAt: null } });
}

/**
 * "Done", from whoever worked on it (lib/workToken). Only an open task, and
 * it closes nothing: the admin confirms it in the app (confirmWorkItem) or
 * sends it back (rejectWorkDone). Returns false when there is no such open task.
 */
export async function reportWorkDone(id: number, note: string, ref: string | null): Promise<boolean> {
    const updated = await prisma.workItem.updateMany({
        // Not over a report already waiting: a second one (or a leaked key)
        // must not swap the link the admin is about to confirm.
        where: { id, closedAt: null, dismissedAt: null, doneAt: null },
        data: { doneAt: new Date(), doneNote: note, doneRef: ref },
    });
    return updated.count === 1;
}

/** "Not done": back on the list, with why, for the next attempt. */
export async function rejectWorkDone(id: number, why: string | null): Promise<boolean> {
    const item = await prisma.workItem.findUnique({ where: { id }, select: { note: true } });
    if (!item) return false;
    const note = why ? capNote([item.note, `Nicht erledigt: ${why}`].filter(Boolean).join('\n')) : item.note;
    // Only a report still waiting: a stale page must not send back a newer one.
    const updated = await prisma.workItem.updateMany({
        where: { id, doneAt: { not: null }, closedAt: null },
        data: { doneAt: null, doneNote: null, doneRef: null, note },
    });
    return updated.count === 1;
}

/**
 * "Bestätigen": closes a task that is reported done and still waiting, and
 * resolves its error or ticket. Returns the task, or null when it was not
 * waiting any more (the error came back meanwhile, or it was answered in
 * another tab) — then nothing is closed.
 */
export async function confirmWorkDone(id: number) {
    const claimed = await prisma.workItem.updateMany({
        where: { id, doneAt: { not: null }, closedAt: null },
        data: { closedAt: new Date(), closedReason: 'confirmed' },
    });
    if (claimed.count !== 1) return null;
    const item = await prisma.workItem.findUnique({ where: { id } });
    if (!item) return null;
    if (item.kind === 'error') await prisma.errorLog.updateMany({ where: { id: item.refId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (item.kind === 'ticket') await prisma.ticket.updateMany({ where: { id: item.refId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    return item;
}

/**
 * Brings one item in line with its row, after the row changed.
 *
 * - The row is gone → the item closes ("removed").
 * - The row is dealt with (error or ticket resolved, capture ready or taken
 *   into the cookbook) → the item closes.
 * - The row is a problem again (an error recurring, a capture that failed
 *   again) → a closed item reopens, unless the admin took it off the list.
 * - There is no item, and this is an obvious failure (workAuto.ts) → one is
 *   added, marked as automatic.
 */
export async function syncWorkItem(kind: WorkKind, refId: number): Promise<void> {
    try {
        const item = await prisma.workItem.findUnique({ where: { kind_refId: { kind, refId } } });
        let problem = false;
        let obvious = false;
        let closeAs: string | null = null;

        // An error seen again after it was reported fixed: the fix was not one.
        let recurred = false;

        if (kind === 'error') {
            const row = await prisma.errorLog.findUnique({ where: { id: refId }, select: { resolvedAt: true, lastSeenAt: true, trusted: true } });
            if (!row) closeAs = 'removed';
            else if (row.resolvedAt) closeAs = 'resolved';
            else {
                problem = true;
                obvious = errorIsObvious(row.trusted);
                // Seen again well after the report — not in the hour a deploy
                // takes, when the old build and old tabs still throw it.
                recurred = Boolean(item?.doneAt && row.lastSeenAt.getTime() > item.doneAt.getTime() + RECURRENCE_GRACE_MS);
            }
        } else if (kind === 'ticket') {
            const row = await prisma.ticket.findUnique({ where: { id: refId }, select: { resolvedAt: true } });
            if (!row) closeAs = 'removed';
            else if (row.resolvedAt) closeAs = 'resolved';
            else problem = true;
        } else {
            const row = await prisma.capture.findUnique({ where: { id: refId }, select: { status: true, error: true } });
            if (!row) closeAs = 'removed';
            else if (row.status === 'published') closeAs = 'published';
            else if (row.status === 'ready') closeAs = 'ready';
            else {
                obvious = captureIsObvious(row.status, row.error);
                problem = obvious;
            }
        }

        if (closeAs) {
            if (item && !item.closedAt) {
                await prisma.workItem.update({ where: { id: item.id }, data: { closedAt: new Date(), closedReason: closeAs } });
            }
            return;
        }

        if (item) {
            if (problem && (item.closedAt || recurred) && !item.dismissedAt) {
                const data = await snapshotOf(kind, refId, item.withPhotos);
                // The report is not thrown away: the next attempt should know
                // what was tried and did not hold.
                const tried = item.doneAt
                    ? `Reported done ${item.doneAt.toISOString().slice(0, 10)}${item.doneRef ? ` (${item.doneRef})` : ''}, but it happened again.`
                    : null;
                await prisma.workItem.update({
                    where: { id: item.id },
                    data: {
                        closedAt: null,
                        closedReason: null,
                        doneAt: null,
                        doneNote: null,
                        doneRef: null,
                        ...(tried ? { note: capNote([item.note, tried].filter(Boolean).join('\n')) } : {}),
                        ...(data ? { data: data as object } : {}),
                    },
                });
            }
            return;
        }

        if (obvious) {
            const data = await snapshotOf(kind, refId);
            if (data) {
                await prisma.workItem
                    .create({ data: { kind, refId, auto: true, data: data as object } })
                    // Two reports of the same error at once: one item is enough.
                    .catch(() => undefined);
            }
        }
    } catch (error) {
        // Never `failed()`: that records an error, which syncs, which could
        // fail again. The log is enough.
        console.error('Work list: keeping an item in step failed:', error);
    }
}

export interface WorkState {
    id: number;
    auto: boolean;
    closed: boolean;
    /** Reported done, waiting for the admin. */
    done: boolean;
}

/**
 * Which of these rows are on the work list (and not withdrawn), for the
 * inbox, error and ticket lists to show it beside each row.
 */
export async function workStates(kind: WorkKind, refIds: number[]): Promise<Map<number, WorkState>> {
    if (refIds.length === 0) return new Map();
    const items = await prisma.workItem.findMany({
        where: { kind, refId: { in: refIds }, dismissedAt: null },
        select: { id: true, refId: true, auto: true, closedAt: true, doneAt: true },
    });
    return new Map(items.map((item) => [item.refId, { id: item.id, auto: item.auto, closed: item.closedAt !== null, done: item.doneAt !== null }]));
}

/**
 * Everything that is still open, brought in line once.
 *
 * The automatic part runs when something happens — an error recorded, a
 * capture read — so rows that were already there when it was switched on
 * were never looked at. This catches them up, and anything that slipped past
 * since. Run when the admin opens the work list and by the weekly job.
 */
export async function syncAll(): Promise<void> {
    const [errors, captures, tickets] = await Promise.all([
        prisma.errorLog.findMany({ where: { resolvedAt: null }, select: { id: true }, take: 500 }),
        prisma.capture.findMany({ where: { status: { in: ['failed', 'needsWork'] } }, select: { id: true }, take: 500 }),
        prisma.workItem.findMany({ where: { kind: 'ticket', closedAt: null }, select: { refId: true } }),
    ]);
    for (const row of errors) await syncWorkItem('error', row.id);
    for (const row of captures) await syncWorkItem('capture', row.id);
    for (const row of tickets) await syncWorkItem('ticket', row.refId);
}
