/**
 * The work list: things the admin has chosen to hand over for fixing.
 *
 * An inbox row that did not read properly, an error the application caught,
 * a ticket somebody wrote — shared one at a time, on purpose, into a list
 * that is public so that whoever does the fixing — a developer, or an AI
 * assistant on a schedule — can read it without an account. Everything else stays private.
 *
 * Public means it is written for strangers. Each item is a *snapshot* made at
 * the moment it is shared, with the people taken out: no author, no e-mail
 * address, no name of anyone who has an account here, and no share-link
 * token that would open a private page. The snapshot is also what keeps the
 * item readable after the capture or ticket behind it is deleted.
 *
 * Pure: the database part is in workItemsDb.ts, so this can be tested.
 */

export const WORK_KINDS = ['capture', 'error', 'ticket'] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Share links and e-mail tokens: `/de/s/<token>`, `/r/<token>`, `?token=…`.
 * A token in a public list is a key left in the door.
 */
const TOKEN_PATH = /\/(s|r|p|c|m)\/[A-Za-z0-9_-]{16,}/g;
const TOKEN_QUERY = /([?&](?:token|invite)=)[^&\s"']+/gi;

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Takes the people out of a piece of text: e-mail addresses, tokens, and the
 * names of everyone with an account here (first, last and full name, as
 * whole words, any case). Short names are left alone — "Jo" would take a bite
 * out of every "Joghurt".
 */
export function anonymize(text: string | null | undefined, people: string[]): string {
    if (!text) return '';
    let clean = text
        .replace(EMAIL, '[E-Mail]')
        .replace(TOKEN_PATH, '/$1/[token]')
        .replace(TOKEN_QUERY, '$1[token]');

    const names = [...new Set(people.map((name) => name.trim()).filter((name) => name.length >= 3))]
        // Longest first, so "Moritz Schumacher" goes before "Moritz" does.
        .sort((a, b) => b.length - a.length);
    for (const name of names) {
        clean = clean.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu'), '[Person]');
    }
    return clean;
}

function cut(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface CaptureSource {
    id: number;
    kind: string;
    source: string;
    sourceUrl: string | null;
    rawText: string | null;
    imageUrl: string | null;
    status: string;
    error: string | null;
    readBy: string | null;
    aiProvider: string | null;
    createdAt: Date;
    draft: { title: string; ingredients: { amount: string; item: string }[]; instructions: string; imageUrl: string } | null;
}

/** An inbox row as the fixer needs it: what was shared, what came out, and why not more. */
export function captureSnapshot(capture: CaptureSource, people: string[]) {
    return {
        source: capture.source,
        kind: capture.kind,
        // A public post's address. Not anonymized beyond tokens: the link is
        // the whole point, and it is somebody else's public page.
        sourceUrl: capture.sourceUrl ? anonymize(capture.sourceUrl, []) : null,
        status: capture.status,
        reason: capture.error,
        readBy: capture.readBy,
        aiProvider: capture.aiProvider,
        sharedAt: capture.createdAt.toISOString(),
        sharedText: cut(anonymize(capture.rawText, people), 3000),
        // Whether a screenshot came with it; the picture itself stays private.
        hadScreenshot: Boolean(capture.imageUrl),
        draft: capture.draft
            ? {
                  title: anonymize(capture.draft.title, people),
                  ingredients: capture.draft.ingredients.slice(0, 60).map((line) => `${line.amount} ${line.item}`.trim()),
                  instructions: cut(anonymize(capture.draft.instructions, people), 2000),
                  hasPicture: Boolean(capture.draft.imageUrl),
              }
            : null,
    };
}

export interface ErrorSource {
    source: string;
    message: string;
    stack: string | null;
    path: string | null;
    count: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
}

export function errorSnapshot(row: ErrorSource, people: string[]) {
    return {
        source: row.source,
        message: anonymize(row.message, people),
        stack: row.stack ? cut(anonymize(row.stack, people), 6000) : null,
        path: row.path ? anonymize(row.path, people) : null,
        count: row.count,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
    };
}

export interface TicketSource {
    kind: string;
    body: string;
    path: string | null;
    createdAt: Date;
}

/** A ticket without its author: who wrote it is the one thing that stays here. */
export function ticketSnapshot(row: TicketSource, people: string[]) {
    return {
        kind: row.kind,
        body: cut(anonymize(row.body, people), 5000),
        path: row.path ? anonymize(row.path, people) : null,
        writtenAt: row.createdAt.toISOString(),
    };
}

/** A short line for the admin's own list. */
export function workTitle(kind: WorkKind, data: Record<string, unknown>): string {
    if (kind === 'capture') {
        const draft = data.draft as { title?: string } | null;
        return draft?.title || String(data.sourceUrl ?? data.source ?? 'Capture');
    }
    if (kind === 'error') return String(data.message ?? 'Error').slice(0, 140);
    return String(data.body ?? 'Ticket').split('\n')[0].slice(0, 140);
}
