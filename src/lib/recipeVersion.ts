import { createHash } from 'node:crypto';
import type { RecipeSnapshot } from './revisions';

/**
 * What an edit form was opened on, as a short fingerprint: the recipe's
 * content and its pictures. Saving compares it with the recipe as it is now,
 * so a second tab (or a restore from the history) is not silently undone by
 * the older form — and pictures removed there are not put back, with their
 * files already gone.
 *
 * Content rather than `updatedAt`: a page view counts into the same row and
 * moves that on every visit.
 */
export function versionOf(snapshot: RecipeSnapshot, imageUrls: string[]): string {
    return createHash('sha256').update(JSON.stringify([snapshot, imageUrls])).digest('base64url').slice(0, 22);
}
