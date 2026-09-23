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
 * Of tickets only "Etwas geht nicht" goes on by itself (lib/workItemsDb): an
 * idea or anything else is somebody's own words, and publishing it is a
 * decision for the admin.
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
 * Every trusted error is a task, at once — on the task list is where they
 * are worked through, and an error that is not there is one nobody looks at.
 * Trusted: seen by the server, or reported by somebody signed in. A report
 * from an anonymous visitor is kept for the admin, who can hand it over; it
 * does not publish itself, because anybody can post one and the list is
 * read by a coding agent.
 */
export function errorIsObvious(trusted: boolean): boolean {
    return trusted;
}
