/**
 * One way to write a date.
 *
 * There were three, and the divergence was not cosmetic. Six components each
 * built their own `Intl.DateTimeFormat` from `locale === 'de' ? 'de-DE' : …`,
 * and three admin pages did not pass a locale at all — those followed the
 * *browser's* language rather than the site's, so a German reader on an
 * English-language iPhone saw `9/21/2026` in the inbox and `21. September 2026`
 * on the blog, on the same visit. One page used `en-GB` where every other used
 * `en-US`, which is the difference between 9/21 and 21/9.
 *
 * Two shapes, because the site genuinely wants two: a long one under an entry,
 * where the date is part of the writing, and a short one in a list, where it is
 * a column. Nothing else, so a third cannot appear by being typed somewhere.
 *
 * The formatters are made once per locale and kept. Building one is not free,
 * and a list of a hundred rows built a hundred of them.
 */

type Style = 'long' | 'short';

const cache = new Map<string, Intl.DateTimeFormat>();

/** The site's locale as a BCP 47 tag. Everything not German is English. */
function localeTag(locale: string): string {
    return locale === 'de' ? 'de-DE' : 'en-US';
}

function formatter(locale: string, style: Style): Intl.DateTimeFormat {
    const key = `${locale}:${style}`;
    const existing = cache.get(key);
    if (existing) return existing;

    const made = new Intl.DateTimeFormat(localeTag(locale), {
        day: 'numeric',
        month: style === 'long' ? 'long' : 'short',
        year: 'numeric',
        // The cookbook's own day, on the server (UTC) and in the browser
        // alike: an entry at half past midnight was otherwise yesterday in
        // the HTML and today once hydrated.
        timeZone: 'Europe/Berlin',
    });

    cache.set(key, made);
    return made;
}

/**
 * A date, written the way the site is being read.
 *
 * Accepts a string as well as a Date, because dates that have been through an
 * API arrive as strings and every call site was converting by hand. An
 * unreadable one returns an empty string rather than "Invalid Date", which is
 * a phrase no reader of a cookbook should ever meet.
 */
export function formatDate(
    value: Date | string | number | null | undefined,
    locale: string,
    style: Style = 'long'
): string {
    if (value === null || value === undefined) return '';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return formatter(locale, style).format(date);
}

/** The same, with the time — for a log, where the hour is the point. */
export function formatDateTime(
    value: Date | string | number | null | undefined,
    locale: string
): string {
    if (value === null || value === undefined) return '';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(localeTag(locale), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}
