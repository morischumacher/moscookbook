import { z } from 'zod';

/**
 * Where a report stands, from the admin's side — one rule for the ticket,
 * error and task panels, so the three cannot disagree about it.
 *
 * - **To do**: open, and nobody else is on it. The admin decides: hand it to
 *   the AI, mark it done, or delete it.
 * - **With the AI**: open, and on the task list (not withdrawn, not closed).
 *   Shown on the task list only; the ticket or error list just counts it, so
 *   one thing is never in two places asking for two decisions.
 * - **Done**: resolved. Kept out of the way, under a fold, until deleted.
 *
 * Pure, so it can be tested.
 */

/** What the work list says about one row (see workStates in workItemsDb). */
export interface WorkStateLike {
    closed: boolean;
}

/** On the task list right now: handed over (or added by itself) and not finished. */
export function withTheAi(work: WorkStateLike | null | undefined): boolean {
    return Boolean(work && !work.closed);
}

export interface Sorted<T> {
    todo: T[];
    withAi: T[];
    done: T[];
}

/** Sorts rows into the three sections, keeping their order. */
export function splitReports<T extends { resolvedAt: string | Date | null; work: WorkStateLike | null }>(rows: T[]): Sorted<T> {
    const sorted: Sorted<T> = { todo: [], withAi: [], done: [] };
    for (const row of rows) {
        if (row.resolvedAt) sorted.done.push(row);
        else if (withTheAi(row.work)) sorted.withAi.push(row);
        else sorted.todo.push(row);
    }
    return sorted;
}

/** How many rows one bulk request may touch: a page of the list, not the table. */
export const MAX_BULK = 200;

const rowId = z.number().int().positive().max(2_147_483_647);

/** `{ ids: [...] }` for a bulk delete — at least one, at most a page, no repeats. */
export const bulkIdsSchema = z.object({
    ids: z
        .array(rowId)
        .min(1)
        .max(MAX_BULK)
        .transform((ids) => [...new Set(ids)]),
});

/**
 * A selection, cut down to what is on screen.
 *
 * "Select all" used to select every row the page had loaded — including the
 * ones folded away and the ones waiting for a confirmation — so "Delete 12"
 * could delete rows nobody had seen. Whatever is acted on must be visible.
 */
export function visibleSelection(selected: Iterable<number>, visible: Iterable<number>): number[] {
    const shown = new Set(visible);
    return [...new Set(selected)].filter((id) => shown.has(id));
}

/** The work list's tasks that can be deleted for good: finished ones only. */
export function deletableTasks<T extends { closedAt: string | Date | null }>(items: T[]): T[] {
    return items.filter((item) => item.closedAt !== null);
}
