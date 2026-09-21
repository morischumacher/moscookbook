/**
 * Where the automated backups live in the Blob store.
 *
 * In a file of its own, and in plain JavaScript, because two things need it and
 * they cannot import each other: the route that writes the backups runs inside
 * Next, and the sweep script is a plain Node script run from the command line.
 * When the two disagreed about this string, the sweep deleted every backup —
 * nothing in the database points at one, so they look exactly like the orphans
 * it is built to remove.
 */
export const BACKUP_PREFIX = 'backups/';
