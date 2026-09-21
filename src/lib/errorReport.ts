import { createHash } from 'node:crypto';

/**
 * Knowing when the cookbook is broken.
 *
 * Right now a failure is noticed by clicking on it by accident, which for a
 * site one person visits means weeks. This is the smallest thing that fixes
 * that: errors are written to the database and listed in the admin area.
 *
 * Deliberately not Sentry. Sentry is better — it symbolicates stacks, it can
 * send an e-mail when something new appears, and it does not compete with the
 * recipes for database rows. But it is a third party, an account and a bill,
 * and this cookbook's rule so far has been that nothing essential may depend
 * on a subscription. Everything here would be thrown away rather than migrated
 * if that changes, which is the right shape for a decision that might be
 * reversed.
 *
 * The two things that keep this from becoming noise:
 *
 *   - Errors are grouped by fingerprint, so the same failure happening two
 *     hundred times is one row with a count, not two hundred rows.
 *   - The message is stripped of the parts that vary — ids, paths, quoted
 *     values — before fingerprinting, so "Recipe 7 not found" and "Recipe 12
 *     not found" are recognised as the same problem.
 */

export type ErrorSource = 'client' | 'server';

export interface ErrorReport {
    source: ErrorSource;
    message: string;
    stack?: string | null;
    /** Where it happened, as a path — never a full URL with query parameters. */
    path?: string | null;
}

/** Long enough to read, short enough not to fill a page. */
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

/**
 * Replaces the parts of a message that differ between occurrences of the same
 * problem. Without this every id, timestamp and uuid starts its own group.
 */
export function normaliseMessage(message: string): string {
    return message
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
        .replace(/\b[0-9a-f]{16,}\b/gi, '<hash>')
        .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, '<time>')
        .replace(/\b\d+\b/g, '<n>')
        .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '<value>')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The first line of the stack that belongs to this application.
 *
 * Framework frames are the same for every error and say nothing about which
 * one it is; the first frame from `src/` or a route is what distinguishes two
 * failures with the same message.
 */
export function significantFrame(stack: string | null | undefined): string {
    if (!stack) return '';

    for (const line of stack.split('\n').slice(1)) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        if (/node_modules|node:internal|webpack-internal|\/next\//.test(trimmed)) continue;

        // Column numbers move with every build; the file and function do not.
        return trimmed.replace(/:\d+:\d+\)?$/, '').slice(0, 200);
    }

    return '';
}

/** Same problem, same fingerprint. */
export function fingerprint(report: ErrorReport): string {
    const parts = [
        report.source,
        normaliseMessage(report.message),
        significantFrame(report.stack),
    ];
    return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 32);
}

/**
 * A path without anything private in it.
 *
 * A query string can carry a search term, and an error report is not the place
 * to start collecting what people looked for. An invite code in a URL would be
 * worse.
 */
export function safePath(input: string | null | undefined): string | null {
    if (!input) return null;
    try {
        const url = input.startsWith('http')
            ? new URL(input)
            : new URL(input, 'https://placeholder.invalid');
        return url.pathname.slice(0, 300);
    } catch {
        return input.split('?')[0].slice(0, 300);
    }
}

export interface StoredError {
    fingerprint: string;
    source: ErrorSource;
    message: string;
    stack: string | null;
    path: string | null;
}

/** Everything a report needs before it touches the database. */
export function prepareErrorReport(report: ErrorReport): StoredError {
    return {
        fingerprint: fingerprint(report),
        source: report.source,
        message: report.message.slice(0, MAX_MESSAGE),
        stack: report.stack ? report.stack.slice(0, MAX_STACK) : null,
        path: safePath(report.path),
    };
}
