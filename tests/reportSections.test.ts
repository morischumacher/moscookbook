/** Tickets, errors and tasks: what is where, and what bulk actions may touch */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, equal, check } from './harness';
import { bulkIdsSchema, deletableTasks, MAX_BULK, splitReports, visibleSelection, withTheAi } from '../src/lib/reportSections';

const source = (path: string) => readFileSync(join(__dirname, '..', 'src', path), 'utf8');

export default function reportSectionsTests() {
    suite('reports: a row handed to the AI leaves the ticket and error lists');
    check('on the list and open: with the AI', withTheAi({ closed: false }));
    check('reported done, waiting for you: still with the AI', withTheAi({ closed: false }));
    check('closed: not with the AI any more', !withTheAi({ closed: true }));
    check('never on it (or withdrawn, which workStates leaves out): not with the AI', !withTheAi(null));

    const rows = [
        { id: 1, resolvedAt: null, work: null },
        { id: 2, resolvedAt: null, work: { closed: false } },
        { id: 3, resolvedAt: '2026-10-01T10:00:00Z', work: null },
        { id: 4, resolvedAt: null, work: { closed: true } },
        { id: 5, resolvedAt: '2026-10-02T10:00:00Z', work: { closed: true } },
    ];
    const sorted = splitReports(rows);
    equal('to do: open and nobody on it', sorted.todo.map((row) => row.id), [1, 4]);
    equal('with the AI: counted, not listed', sorted.withAi.map((row) => row.id), [2]);
    equal('done: resolved, whatever the task says', sorted.done.map((row) => row.id), [3, 5]);

    suite('reports: bulk requests');
    equal('ids, without repeats', bulkIdsSchema.safeParse({ ids: [3, 3, 4] }).data?.ids, [3, 4]);
    check('none is refused', !bulkIdsSchema.safeParse({ ids: [] }).success);
    check('a missing list is refused', !bulkIdsSchema.safeParse({}).success);
    check('not an id is refused', !bulkIdsSchema.safeParse({ ids: [0] }).success && !bulkIdsSchema.safeParse({ ids: ['1'] }).success);
    check('more than a page is refused', !bulkIdsSchema.safeParse({ ids: Array.from({ length: MAX_BULK + 1 }, (_, i) => i + 1) }).success);

    suite('reports: a selection acts only on what is on screen');
    equal('folded-away rows drop out', visibleSelection([1, 2, 9], [1, 2, 3]), [1, 2]);
    equal('repeats collapse', visibleSelection([1, 1], [1]), [1]);
    equal('nothing visible, nothing acted on', visibleSelection([1, 2], []), []);
    equal('only finished tasks can be deleted', deletableTasks([{ id: 1, closedAt: null }, { id: 2, closedAt: '2026-10-01' }]).map((item) => item.id), [2]);

    suite('reports: routes');
    const tickets = source('app/api/tickets/route.ts');
    check('a ticket PATCH on nothing answers 404 again', tickets.includes('updated.count === 0') && tickets.includes('status: 404'));
    check('deleting tickets deletes their screenshots\' files', tickets.includes('deleteBlobs(photos'));
    check('deleting tickets is one request for many', tickets.includes('bulkIdsSchema.safeParse'));
    // The form sends `path: null` when there is no page (opened from the
    // footer, or the page taken off): that was refused with a 400.
    check('a ticket without a page is taken', tickets.includes('path: z.string().trim().nullish()'));
    check('only the admin sends a ticket straight to the AI, and it is checked', tickets.includes('toAi && user.admin') && tickets.includes('onTaskList'));
    check('the ticket list leaves out what is with the AI', tickets.includes('splitReports('));
    const errors = source('app/api/errors/route.ts');
    check('errors can be deleted many at once, files with them', errors.includes('export async function DELETE') && errors.includes('deleteBlobs(photos'));
    check('the error list leaves out what is with the AI', errors.includes('splitReports('));
    const work = source('app/api/work-items/route.ts');
    check('tasks can be deleted for good', work.includes('export const DELETE') && work.includes('deleteFinishedWorkItems'));
    check('withdrawn tasks are not listed', work.includes('where: { dismissedAt: null }'));
    const db = source('lib/workItemsDb.ts');
    check('only finished tasks are deleted', db.includes('closedAt: { not: null } } });'));
    check('no ticket is a task by itself', db.includes('obvious = false;') && !db.includes("obvious = row.kind === 'problem';"));
    check('an item older than its row does not decide for it', db.includes('STALE_SLACK_MS'));

    suite('reports: no hard-coded words in the panels');
    for (const panel of ['components/admin/TicketsPanel.tsx', 'components/admin/WorkPanel.tsx', 'components/admin/ErrorsPanel.tsx', 'components/admin/ReportSections.tsx']) {
        const text = source(panel);
        check(`${panel} has no German of its own`, !/(ausgewählt|Alle auswählen|löschen|schließen|zurückziehen|erledigt)/.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    }
}
