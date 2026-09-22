import type { z } from 'zod';

/**
 * A validation failure as one sentence for the screen.
 *
 * Three schema modules each had a formatter, and they disagreed: two took
 * the first issue's message and dropped the field name, one named every
 * field and joined the lot. The one that names the field is the useful one
 * — "title: too short" can be acted on; "too short" cannot — so it is the
 * one that survives, and the other two are gone.
 */
export function formatZodError(error: z.ZodError): string {
    const sentence = error.issues
        .map((issue) => {
            const path = issue.path.join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');

    return sentence || 'Invalid input data';
}
