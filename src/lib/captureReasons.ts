/**
 * Why a capture is not ready, as a code the inbox translates.
 *
 * These used to be English sentences written into the capture's `error`
 * column, which the inbox showed as they were — in English, to a German
 * reader, in an otherwise German page. A code is stored instead
 * (`reason:pageUnreadable:timeout`), and the inbox says it in the reader's
 * language. An old row with a sentence in it is still shown as it was.
 */

export const REASON_CODES = [
    'notYoutube',
    'youtubeUnreadable',
    'pageUnreadable',
    'sharedTextUsed',
    'noPicture',
    'pictureNeedsAi',
    'pictureUnreadable',
    'picturePartial',
    'pictureFailed',
    'nothingSent',
    'textPartial',
    'noLink',
    'somethingWrong',
    'noRecipe',
    'pagePartial',
    'videoPartial',
    'videoSpoken',
    'videoSpokenNeedsAi',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** What a fetch failure is called, for the detail of `pageUnreadable` and `youtubeUnreadable`. */
export const FETCH_DETAILS = ['timeout', 'http-error', 'network', 'unsafe-url', 'not-a-page'] as const;

const PREFIX = 'reason:';

export function reason(code: ReasonCode, detail?: string): string {
    return detail ? `${PREFIX}${code}:${detail}` : `${PREFIX}${code}`;
}

/** The code and its detail, or null for an old row's sentence or a crash message. */
export function readReason(error: string | null | undefined): { code: ReasonCode; detail: string | null } | null {
    if (!error?.startsWith(PREFIX)) return null;
    const [code, ...rest] = error.slice(PREFIX.length).split(':');
    if (!(REASON_CODES as readonly string[]).includes(code)) return null;
    return { code: code as ReasonCode, detail: rest.join(':') || null };
}
