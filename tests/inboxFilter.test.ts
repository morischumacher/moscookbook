/** Inbox: search, filter and order */
import { suite, equal } from './harness';
import { countBy, filterInbox, NO_FILTER } from '../src/lib/inboxFilter';

const row = (id: number, over: Partial<Parameters<typeof filterInbox>[0][number]>) => ({
    id,
    source: 'web',
    status: 'ready',
    sourceUrl: null,
    rawText: null,
    note: null,
    createdAt: `2026-09-${String(10 + id).padStart(2, '0')}T10:00:00Z`,
    draft: null,
    ...over,
});

export default function inboxFilterTests() {
    const rows = [
        row(1, { source: 'instagram', status: 'needsWork', draft: { title: 'Hainanese Chicken Rice', ingredients: [1, 2] } }),
        row(2, { source: 'youtube', status: 'ready', draft: { title: 'Käsespätzle', ingredients: [1, 2, 3] } }),
        row(3, { source: 'instagram', status: 'failed', sourceUrl: 'https://instagram.com/p/abc' }),
        row(4, { source: 'web', status: 'ready', draft: { title: 'Linsensuppe', ingredients: [1] }, note: 'von Oma' }),
    ];
    const ids = (query: Partial<typeof NO_FILTER>) => filterInbox(rows, { ...NO_FILTER, ...query }).map((capture) => capture.id);

    suite('inbox: filtering');
    equal('newest first by default', ids({}), [4, 3, 2, 1]);
    equal('oldest first', ids({ sort: 'oldest' }), [1, 2, 3, 4]);
    equal('by source', ids({ source: 'instagram' }), [3, 1]);
    equal('by state', ids({ state: 'ready' }), [4, 2]);
    equal('search ignores case and accents', ids({ search: 'kasespatzle' }), [2]);
    equal('every word has to match, anywhere in the row', ids({ search: 'chicken hainanese' }), [1]);
    equal('the note and the link are searched too', ids({ search: 'oma' }), [4]);
    equal('a link is found by a piece of it', ids({ search: 'instagram.com/p' }), [3]);
    equal('most complete: ready and fuller first, failed last', ids({ sort: 'complete' }), [2, 4, 1, 3]);

    suite('inbox: counts');
    equal('busiest first', countBy(rows, (capture) => capture.source), [
        { value: 'instagram', count: 2 },
        { value: 'youtube', count: 1 },
        { value: 'web', count: 1 },
    ]);
}
