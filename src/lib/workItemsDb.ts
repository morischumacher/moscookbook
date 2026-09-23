import prisma from './prisma';
import en from '../../messages/en.json';
import { draftFromJson } from './captureDraft';
import { readReason } from './captureReasons';
import { aiCapability } from './aiConfig';
import { hostOf } from './siteProfile';
import { captureSnapshot, errorSnapshot, ticketSnapshot, type WorkKind } from './workItems';
import { captureIsObvious, errorIsObvious } from './workAuto';

/**
 * The work list's side of the database: snapshots, and keeping each item in
 * step with the row it was made from.
 *
 * Nothing here may break what called it. Every entry point is used from a
 * path that matters more — recording an error, reading a capture, marking a
 * ticket done — so failures are logged and swallowed.
 */

/** Which build the site is running; lets a fixer tell "fixed since" from "still broken". */
export function appVersion(): string {
    return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';
}

/** Every name somebody with an account goes by — what anonymize takes out. */
async function peopleNames(): Promise<string[]> {
    const users = await prisma.user.findMany({ select: { name: true, firstName: true, lastName: true } });
    return users.flatMap((user) => [user.name, user.firstName, user.lastName]);
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
export async function snapshotOf(kind: WorkKind, refId: number): Promise<Record<string, unknown> | null> {
    const people = await peopleNames();
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
            reasonText: reasonText(row.error),
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
    if (kind === 'error') {
        const row = await prisma.errorLog.findUnique({ where: { id: refId } });
        return row ? { ...errorSnapshot(row, people), resolved: row.resolvedAt !== null, appVersion: version } : null;
    }
    const row = await prisma.ticket.findUnique({ where: { id: refId } });
    return row ? { ...ticketSnapshot(row, people), resolved: row.resolvedAt !== null, appVersion: version } : null;
}

/**
 * Hands a row over by hand. Sharing again refreshes the snapshot and note,
 * reopens it, and undoes an earlier "take off the list".
 */
export async function publishWorkItem(kind: WorkKind, refId: number, note: string | null) {
    const data = await snapshotOf(kind, refId);
    if (!data) return null;
    return prisma.workItem.upsert({
        where: { kind_refId: { kind, refId } },
        create: { kind, refId, note, data: data as object },
        update: { note, data: data as object, closedAt: null, closedReason: null, dismissedAt: null, auto: false, createdAt: new Date() },
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
export async function closeWorkItem(id: number) {
    const item = await prisma.workItem.update({ where: { id }, data: { closedAt: new Date(), closedReason: 'done' } });
    if (item.kind === 'error') await prisma.errorLog.updateMany({ where: { id: item.refId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (item.kind === 'ticket') await prisma.ticket.updateMany({ where: { id: item.refId, resolvedAt: null }, data: { resolvedAt: new Date() } });
}

export async function reopenWorkItem(id: number) {
    const item = await prisma.workItem.update({ where: { id }, data: { closedAt: null, closedReason: null } });
    if (item.kind === 'ticket') await prisma.ticket.updateMany({ where: { id: item.refId }, data: { resolvedAt: null } });
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

        if (kind === 'error') {
            const row = await prisma.errorLog.findUnique({ where: { id: refId }, select: { source: true, count: true, resolvedAt: true } });
            if (!row) closeAs = 'removed';
            else if (row.resolvedAt) closeAs = 'resolved';
            else {
                problem = true;
                obvious = errorIsObvious(row.source, row.count);
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
            if (problem && item.closedAt && !item.dismissedAt) {
                const data = await snapshotOf(kind, refId);
                await prisma.workItem.update({
                    where: { id: item.id },
                    data: { closedAt: null, closedReason: null, ...(data ? { data: data as object } : {}) },
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
}

/**
 * Which of these rows are on the work list (and not withdrawn), for the
 * inbox, error and ticket lists to show it beside each row.
 */
export async function workStates(kind: WorkKind, refIds: number[]): Promise<Map<number, WorkState>> {
    if (refIds.length === 0) return new Map();
    const items = await prisma.workItem.findMany({
        where: { kind, refId: { in: refIds }, dismissedAt: null },
        select: { id: true, refId: true, auto: true, closedAt: true },
    });
    return new Map(items.map((item) => [item.refId, { id: item.id, auto: item.auto, closed: item.closedAt !== null }]));
}
