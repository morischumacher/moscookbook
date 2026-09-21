import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Captures: the inbox everything arrives in before it becomes a recipe.
 *
 * The point of the inbox is to separate three things that used to be one
 * ten-minute chore. Collecting has to be instant — one tap in a share sheet,
 * while standing in a supermarket. Parsing may be slow and is allowed to fail.
 * Deciding what actually belongs in the cookbook is judgement, and can wait
 * until there is a free evening.
 *
 * So a capture is stored raw first and is never lost because a parser choked
 * on it: a failed capture still holds everything that was sent, and can be
 * retried after the parser improves.
 */

/** What arrived. */
export type CaptureKind = 'url' | 'text' | 'image';

/**
 * Where it came from. Kept apart from `kind` because the handling differs:
 * a YouTube link needs the video description, a recipe site needs its
 * structured data, and Instagram needs a human with a screenshot.
 */
export type CaptureSource =
    | 'youtube'
    | 'instagram'
    | 'tiktok'
    | 'web'
    | 'note'
    | 'email'
    | 'photo';

/**
 * new        → not looked at yet
 * ready      → parsed well enough to publish in one click
 * needsWork  → something came through, but not enough to publish blind
 * failed     → the parser could not use it; the raw capture is still there
 * published  → became a recipe
 */
export type CaptureStatus = 'new' | 'ready' | 'needsWork' | 'failed' | 'published';

export const CAPTURE_STATUSES: CaptureStatus[] = [
    'new',
    'ready',
    'needsWork',
    'failed',
    'published',
];

/* -------------------------------------------------------------------------- */
/* Tokens                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 256 bits. This token sits in an iOS Shortcut on a phone, in plain text, and
 * it is the only thing between the open internet and a write to the database —
 * so it is longer than the invite codes, which are at least single-use.
 */
export function generateCaptureToken(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Only the hash is stored. A database dump should not hand someone a working
 * key, and the token is high-entropy and random, so a plain SHA-256 is right
 * here — there is nothing to brute-force and no need for a slow KDF.
 */
export function hashCaptureToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time compare, so a wrong token leaks nothing through timing. */
export function captureTokenMatches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(hashCaptureToken(token), 'hex');
    let expected: Buffer;

    try {
        expected = Buffer.from(expectedHash, 'hex');
    } catch {
        return false;
    }

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
}

/**
 * Pulls the token out of an Authorization header.
 *
 * Shortcuts sends whatever it is told to, so both "Bearer x" and a bare "x"
 * are accepted — a capture lost to a header format is a capture lost while
 * standing in a shop.
 */
export function tokenFromHeader(header: string | null): string | null {
    if (!header) return null;
    const value = header.trim();
    if (value === '') return null;
    const bearer = /^Bearer\s+(.+)$/i.exec(value);
    return (bearer ? bearer[1] : value).trim() || null;
}

/* -------------------------------------------------------------------------- */
/* Classifying what arrived                                                    */
/* -------------------------------------------------------------------------- */

const HOST_SOURCES: [RegExp, CaptureSource][] = [
    [/(^|\.)youtube\.com$/i, 'youtube'],
    [/^youtu\.be$/i, 'youtube'],
    [/(^|\.)instagram\.com$/i, 'instagram'],
    [/(^|\.)tiktok\.com$/i, 'tiktok'],
];

/** Which handling a link needs, from its host alone. */
export function sourceForUrl(url: string): CaptureSource {
    let host: string;
    try {
        host = new URL(url).hostname;
    } catch {
        return 'web';
    }

    for (const [pattern, source] of HOST_SOURCES) {
        if (pattern.test(host)) return source;
    }
    return 'web';
}

/**
 * The first URL in a piece of shared text.
 *
 * iOS hands over whatever the app offered, which is often a title, a line of
 * prose and a link in one blob — "Schau dir das an: https://… " — so the link
 * has to be dug out rather than assumed to be the whole payload.
 */
export function firstUrlIn(text: string): string | null {
    const match = /https?:\/\/[^\s<>"')\]]+/i.exec(text);
    if (!match) return null;

    // Trailing punctuation belongs to the sentence, not to the link.
    return match[0].replace(/[.,;:!?]+$/, '');
}

/**
 * Drops lines that are nothing but a link.
 *
 * A share arrives as "https://…\n\nSpaghetti Aglio e Olio\n\nZutaten\n…", and
 * the recipe parser takes the first line as the title — which would make the
 * URL the name of the recipe. The link is already held separately in
 * `sourceUrl`, so nothing is lost by taking it out of the prose.
 */
export function withoutBareUrls(text: string): string {
    return text
        .split('\n')
        .filter((line) => !/^\s*https?:\/\/\S+\s*$/i.test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export interface CaptureInput {
    url?: string | null;
    text?: string | null;
    note?: string | null;
    /**
     * What sent this, when the sender knows and the text cannot say.
     *
     * Only consulted for text with no link in it: a link's own host is a
     * better answer than any hint, because it decides how the capture is read.
     * So a forwarded YouTube link is handled as YouTube and merely happens to
     * have arrived by mail.
     */
    via?: CaptureSource | null;
    /**
     * A picture that came with the share, already in our own store.
     *
     * A screenshot is how most people save a recipe on a phone: it takes one
     * button and works on an app that refuses to be read any other way. It is
     * kept alongside whatever else was sent rather than instead of it — a
     * screenshot of an Instagram post usually arrives with the post's link,
     * and the link is tried first because a page can be read and a picture has
     * to be looked at.
     */
    imageUrl?: string | null;
}

export interface ClassifiedCapture {
    kind: CaptureKind;
    source: CaptureSource;
    sourceUrl: string | null;
    rawText: string | null;
    note: string | null;
    /** Carried whatever the kind is, so a picture is never the thing that got lost. */
    imageUrl: string | null;
}

/**
 * Decides what was sent.
 *
 * A link wins over the text around it, because a page can be read and prose
 * about a page cannot — but the text is kept either way. When a share carries
 * both a link and a full recipe in the caption, which is exactly what
 * Instagram does, nothing is thrown away.
 */
export function classifyCapture(input: CaptureInput): ClassifiedCapture | null {
    const text = (input.text ?? '').trim();
    const note = (input.note ?? '').trim() || null;
    const explicitUrl = (input.url ?? '').trim();
    const imageUrl = (input.imageUrl ?? '').trim() || null;

    const url = explicitUrl || firstUrlIn(text) || '';

    if (url !== '') {
        return {
            kind: 'url',
            source: sourceForUrl(url),
            sourceUrl: url,
            rawText: text || null,
            note,
            imageUrl,
        };
    }

    // Text beats a picture: reading words is exact, reading a picture of words
    // is a guess. A screenshot shared with its caption is handled as the
    // caption, and the picture stays attached in case the caption was not the
    // recipe after all.
    if (text !== '') {
        return {
            kind: 'text',
            source: input.via ?? 'note',
            sourceUrl: null,
            rawText: text,
            note,
            imageUrl,
        };
    }

    if (imageUrl !== null) {
        return {
            kind: 'image',
            source: 'photo',
            sourceUrl: null,
            rawText: null,
            note,
            imageUrl,
        };
    }

    return null;
}

/* -------------------------------------------------------------------------- */
/* Titles                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A label for the inbox before anything has been parsed.
 *
 * The list has to be readable the moment a capture lands, including when
 * parsing later fails — "instagram.com" tells you more than "Capture #12".
 */
export function captureLabel(capture: {
    sourceUrl: string | null;
    rawText: string | null;
    note: string | null;
}): string {
    if (capture.note) return capture.note;

    const firstLine = (capture.rawText ?? '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line !== '' && !/^https?:\/\//i.test(line));

    if (firstLine) return firstLine.slice(0, 120);

    if (capture.sourceUrl) {
        try {
            const parsed = new URL(capture.sourceUrl);
            return parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '');
        } catch {
            return capture.sourceUrl.slice(0, 120);
        }
    }

    // Empty rather than a placeholder: the wording belongs in the translation
    // catalogue, not in a library.
    return '';
}
