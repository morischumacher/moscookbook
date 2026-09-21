/**
 * Reading a recipe out of an e-mail.
 *
 * E-mail is the channel that works from every device and every app without
 * installing anything, which is exactly why what arrives is such a mess:
 * forwarded headers, quoted replies, signatures, "Sent from my iPhone", and a
 * subject line that has been through three clients.
 *
 * The rules here are deliberately one-sided. Removing too little leaves some
 * furniture in a draft that a human is about to look at anyway; removing too
 * much deletes an ingredient nobody will notice is gone. So everything here
 * cuts only at markers that cannot be part of a recipe.
 */

/**
 * Forwarding prefixes, in the languages a German mailbox collects them.
 * Repeated, because a mail forwarded twice carries "WG: Fwd: ".
 */
const SUBJECT_PREFIX = /^\s*(re|aw|fwd?|wg|antw|tr|rv)\s*(\[\d+\])?\s*:\s*/i;

/** "WG: Fwd: Omas Kuchen" → "Omas Kuchen" */
export function subjectAsTitle(subject: string): string {
    let title = subject.trim();

    // Loop rather than one pass: each forward adds another prefix.
    for (let round = 0; round < 10; round += 1) {
        const stripped = title.replace(SUBJECT_PREFIX, '');
        if (stripped === title) break;
        title = stripped.trim();
    }

    return title;
}

/**
 * Lines that end the message proper. Everything from here down goes.
 *
 * A signature and a mail client's boilerplate always come last, so cutting is
 * safe. A forwarded *header* is not in this list on purpose: in a forward the
 * recipe comes after it, and cutting there would throw away the whole point.
 */
const CUT_AT = [
    /^--\s*$/,
    /^__+\s*$/,
    /^gesendet von meinem /i,
    /^sent from my /i,
    /^diese e-?mail wurde von /i,
    /^von meinem (iphone|ipad|android|samsung)/i,
    /^abmelden\b/i,
    /^unsubscribe\b/i,
];

/** Header lines inside a forwarded block, which are about the mail, not the food. */
const HEADER_LINE =
    /^\s*(von|an|cc|bcc|datum|gesendet|betreff|from|to|date|sent|subject|reply-to)\s*:\s/i;

/** The separator a client puts above a forwarded message. */
const FORWARD_SEPARATOR =
    /^\s*(-{2,}\s*(weitergeleitete nachricht|forwarded message|original message|ursprüngliche nachricht)\s*-{2,}|-{5,})\s*$/i;

/** "Am 21.09.2026 um 10:00 schrieb Mo:" / "On Mon, 21 Sep 2026 at 10:00, Mo wrote:" */
const REPLY_ATTRIBUTION = /^\s*(am .+ schrieb .+:|on .+ wrote:)\s*$/i;

export function stripEmailFurniture(body: string): string {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    let kept: string[] = [];

    // What somebody wrote *above* the forward — "Schau mal, das ist das Rezept
    // von Tante Elfi." — is a covering note, not the recipe. It is kept aside
    // rather than dropped outright, because a mail whose forwarded part turns
    // out to be empty should still yield whatever was there.
    let preamble: string[] = [];

    for (const line of lines) {
        if (CUT_AT.some((pattern) => pattern.test(line))) break;

        if (FORWARD_SEPARATOR.test(line)) {
            // The separator says "the forwarded message starts here", so
            // everything gathered so far belongs to the forwarder. Without
            // this, the parser names every forwarded recipe after the first
            // line of the covering note.
            preamble = kept;
            kept = [];
            continue;
        }

        if (HEADER_LINE.test(line)) continue;
        if (REPLY_ATTRIBUTION.test(line)) continue;

        // Quote markers are stripped rather than the line being dropped. A
        // recipe that has been replied to arrives entirely quoted, and dropping
        // those lines would leave an empty capture.
        kept.push(line.replace(/^\s*>+\s?/, ''));
    }

    const tidy = (block: string[]) => block.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    const forwarded = tidy(kept);
    return forwarded !== '' ? forwarded : tidy(preamble);
}

export interface EmailCapture {
    /** The subject, cleaned of forwarding prefixes. Empty when there was none. */
    title: string;
    /** The body, cleaned of furniture. */
    text: string;
}

/**
 * What the mail bridge should send on.
 *
 * The subject becomes the note rather than being glued to the front of the
 * body: the recipe parser names a recipe after the first line it is given, and
 * a subject like "Fwd: schau mal" would become the name of the dish. As a note
 * it labels the capture in the inbox and is ignored by the parser.
 */
export function emailToCapture(subject: string, body: string): EmailCapture {
    return {
        title: subjectAsTitle(subject),
        text: stripEmailFurniture(body),
    };
}
