/**
 * What a failed request has to say for itself.
 *
 * Every route in this application answers a failure with `{ message }` — one
 * sentence, already translated, written for the person rather than for a log.
 * Nine components were reading that body by hand, each with its own
 * `.json().catch(() => ({}))` and its own idea of what to do when the body was
 * not JSON at all, and four of them did not read it: they caught the failure
 * and showed nothing, so a request that failed looked exactly like one that
 * worked.
 *
 * This is the one reader. It never throws and it always returns something
 * sayable: a body with no message, a body that is not JSON, a 502 from the
 * platform with an HTML error page in it — all of them come back as the
 * caller's fallback, which is a sentence about what was being attempted and
 * therefore more use than "Unexpected token < in JSON".
 */
import { germanFor, looksGerman } from './apiMessageDe';

/** The page's language, as the root layout sets it. */
function pageLocale(): string {
    return typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en';
}

/**
 * A route's sentence, fit to show on this page: in German on a German page
 * (lib/apiMessageDe), and the caller's own fallback when there is no
 * sentence — or only an English one nobody has translated yet.
 */
export function sayable(message: unknown, fallback: string, locale: string = pageLocale()): string {
    if (typeof message !== 'string' || message.trim() === '') return fallback;
    if (locale !== 'de') return message;
    return germanFor(message) ?? (looksGerman(message) ? message : fallback);
}

export async function messageFrom(response: Response, fallback: string): Promise<string> {
    let body: unknown;

    try {
        body = await response.json();
    } catch {
        return fallback;
    }

    if (typeof body !== 'object' || body === null) return fallback;

    const { message } = body as { message?: unknown };

    // A whitespace-only message is a message nobody wrote on purpose.
    return sayable(message, fallback);
}
