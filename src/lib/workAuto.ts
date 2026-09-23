import { readReason, type ReasonCode } from './captureReasons';

/**
 * Which failures go onto the work list by themselves.
 *
 * Only the obvious ones — where the application, not the world, is at fault
 * and a fix in the code is the likely answer. Deliberately *not*: a post that
 * really has no recipe (in the bio, in the comments, only spoken), a note
 * somebody typed that was never a recipe, a screenshot waiting for the AI to
 * be switched on. Those are the importer telling the truth, and a work list
 * full of them would hide the ones that matter.
 *
 * Tickets never go on by themselves: they are somebody's own words, and
 * publishing them is a decision for the admin.
 */

/** Reasons that mean the reader fell short, not that there was nothing to read. */
const OBVIOUS_REASONS: ReasonCode[] = [
    'youtubeUnreadable',
    'pageUnreadable',
    'somethingWrong',
    'pictureFailed',
    'pagePartial',
    'videoPartial',
    'picturePartial',
];

export function captureIsObvious(status: string, error: string | null): boolean {
    if (status !== 'failed' && status !== 'needsWork') return false;
    const reason = readReason(error);
    if (!reason || !OBVIOUS_REASONS.includes(reason.code)) return false;
    // A link to a private address is refused on purpose; nothing to fix.
    if (reason.detail === 'unsafe-url') return false;
    return true;
}

/**
 * A server error is a bug the moment it happens. A client error is published
 * once it has happened twice: one alone is as often a browser extension or a
 * dropped connection as it is the site.
 */
export function errorIsObvious(source: string, count: number): boolean {
    return source === 'server' || count >= 2;
}
