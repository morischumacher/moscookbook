/**
 * What a push to the owner's phone says, from the events waiting to be sent.
 *
 * Pure on purpose: no Prisma, no fetch, so the test suite can feed it rows.
 * The sending and the waiting live in ./activityPushDb.ts.
 *
 * Several events that arrive together become one message. Events by the same
 * person on the same recipe fold into one line — "gekocht" a moment before a
 * note and two photographs is one evening, not four pushes.
 */

export type ActivityKind = 'rating' | 'cooked' | 'note' | 'photo' | 'ticket';

export interface ActivityRow {
    kind: string;
    actorName: string;
    recipeTitle: string | null;
    recipeSlug: string | null;
    /** Stars for a rating, the number of photographs for a photo. */
    amount: number | null;
    text: string | null;
}

export interface Push {
    title: string;
    message: string;
    click: string;
    tags: string[];
}

/**
 * How long an event waits for company before it goes out. Short enough to
 * still feel immediate, long enough for "gekocht" and the note typed after
 * it, or a run of ratings, to arrive as one message. Must stay well inside
 * the routes' `maxDuration` (60 s), because the waiting happens in `after()`.
 */
export const BUNDLE_WAIT_MS = 40_000;

/** Lines in one push before the rest is counted rather than listed. */
const MAX_LINES = 6;

/** Cuts a note or ticket to a phone's notification length, on a word where it can. */
export function shorten(text: string, max = 80): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    const cut = flat.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function stars(value: number): string {
    const n = Math.max(0, Math.min(5, Math.round(value)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
}

interface Group {
    actorName: string;
    recipeTitle: string | null;
    recipeSlug: string | null;
    ticket: string | null;
    rating: number | null;
    cooked: boolean;
    photos: number;
    note: string | null;
}

function groupRows(rows: ActivityRow[]): Group[] {
    const groups = new Map<string, Group>();
    let ticketCount = 0;

    for (const row of rows) {
        // Every ticket is its own line; everything else folds per person and recipe.
        const key = row.kind === 'ticket' ? `ticket:${ticketCount++}` : `${row.actorName}\u0000${row.recipeSlug ?? ''}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                actorName: row.actorName,
                recipeTitle: row.recipeTitle,
                recipeSlug: row.recipeSlug,
                ticket: null,
                rating: null,
                cooked: false,
                photos: 0,
                note: null,
            };
            groups.set(key, group);
        }

        switch (row.kind) {
            case 'rating':
                if (row.amount !== null) group.rating = row.amount;
                break;
            case 'cooked':
                group.cooked = true;
                if (row.text) group.note = row.text;
                break;
            case 'note':
                if (row.text) group.note = row.text;
                break;
            case 'photo':
                group.photos += row.amount ?? 1;
                break;
            case 'ticket':
                group.ticket = row.text ?? '';
                break;
        }
    }

    return [...groups.values()];
}

/** "★★★★☆ · gekocht · 2 Fotos · „Halb so viel Chili“" */
function details(group: Group): string {
    if (group.ticket !== null) return `„${shorten(group.ticket)}“`;
    const parts: string[] = [];
    if (group.rating !== null) parts.push(stars(group.rating));
    if (group.cooked) parts.push('gekocht');
    if (group.photos > 0) parts.push(group.photos === 1 ? '1 Foto' : `${group.photos} Fotos`);
    if (group.note) parts.push(`„${shorten(group.note)}“`);
    return parts.join(' · ');
}

function subject(group: Group): string {
    return group.ticket !== null ? 'Feedback' : (group.recipeTitle ?? 'Rezept');
}

function tagFor(group: Group): string {
    if (group.ticket !== null) return 'speech_balloon';
    if (group.rating !== null && !group.cooked && group.photos === 0) return 'star';
    if (group.photos > 0 && !group.cooked) return 'camera';
    return 'fork_and_knife';
}

export function buildPush(rows: ActivityRow[], siteUrl: string): Push | null {
    const groups = groupRows(rows);
    if (groups.length === 0) return null;

    const base = siteUrl.replace(/\/$/, '');
    const slugs = new Set(groups.map((group) => (group.ticket !== null ? '#ticket' : group.recipeSlug ?? '')));
    const only = slugs.size === 1 ? [...slugs][0] : null;
    const click =
        only === '#ticket'
            ? `${base}/de/admin/tickets`
            : only
              ? `${base}/de/recipe/${encodeURIComponent(only)}`
              : `${base}/de`;

    if (groups.length === 1) {
        const [group] = groups;
        return {
            title: subject(group),
            message: `${group.actorName}: ${details(group)}`,
            click,
            tags: [tagFor(group)],
        };
    }

    const lines = groups.slice(0, MAX_LINES).map((group) => `${group.actorName} · ${subject(group)}: ${details(group)}`);
    const rest = groups.length - MAX_LINES;
    if (rest > 0) lines.push(rest === 1 ? '… und 1 weitere' : `… und ${rest} weitere`);

    return {
        title: `${groups.length} neue Aktivitäten im Kochbuch`,
        message: lines.join('\n'),
        click,
        tags: ['fork_and_knife'],
    };
}
