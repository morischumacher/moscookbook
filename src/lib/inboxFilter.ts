/**
 * Finding one thing in the inbox.
 *
 * The inbox holds up to two hundred captures and, until now, showed them in
 * one list, newest first, with nothing to narrow it. That is fine at five and
 * hopeless at fifty — "the curry I sent from Instagram last week" meant
 * scrolling. So: words, a source, a state, an order. All of it in the browser:
 * the whole list is already there, and a round trip per keystroke would buy
 * nothing.
 */

export const INBOX_STATES = ['ready', 'needsWork', 'failed', 'new'] as const;
export type InboxState = (typeof INBOX_STATES)[number];

export const INBOX_SORTS = ['newest', 'oldest', 'complete'] as const;
export type InboxSort = (typeof INBOX_SORTS)[number];

export interface Filterable {
    source: string;
    status: string;
    sourceUrl: string | null;
    rawText: string | null;
    note: string | null;
    createdAt: string;
    draft: { title?: string; ingredients?: unknown[] } | null;
}

export interface InboxQuery {
    search: string;
    /** '' for every source. */
    source: string;
    /** '' for every state. */
    state: InboxState | '';
    sort: InboxSort;
}

export const NO_FILTER: InboxQuery = { search: '', source: '', state: '', sort: 'newest' };

/** Lower case, accents gone: "Käse" is found by "kase" and by "Käse". */
function folded(text: string): string {
    return text
        .toLocaleLowerCase('de')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss');
}

/** Every word has to be somewhere in the row: title, link, note or shared text. */
export function matchesSearch(capture: Filterable, search: string): boolean {
    const words = folded(search).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = folded(
        [capture.draft?.title, capture.sourceUrl, capture.note, capture.rawText].filter(Boolean).join(' ')
    );
    return words.every((word) => haystack.includes(word));
}

/**
 * How far along a capture is, for "most complete first": ready before needing
 * a minute before not yet read before failed, then more ingredients first.
 */
function readiness(capture: Filterable): number {
    const rank = { ready: 3, needsWork: 2, new: 1, failed: 0 }[capture.status as InboxState] ?? 0;
    return rank * 1000 + Math.min(capture.draft?.ingredients?.length ?? 0, 999);
}

export function filterInbox<T extends Filterable>(captures: T[], query: InboxQuery): T[] {
    const kept = captures.filter(
        (capture) =>
            (!query.source || capture.source === query.source) &&
            (!query.state || capture.status === query.state) &&
            matchesSearch(capture, query.search)
    );

    const time = (capture: Filterable) => Date.parse(capture.createdAt) || 0;
    return [...kept].sort((a, b) =>
        query.sort === 'oldest'
            ? time(a) - time(b)
            : query.sort === 'complete'
              ? readiness(b) - readiness(a) || time(b) - time(a)
              : time(b) - time(a)
    );
}

/** How many of each value there are, for the counts on the chips — busiest first. */
export function countBy<T>(items: T[], key: (item: T) => string): { value: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}
