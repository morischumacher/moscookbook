import { classifyCapture, type ClassifiedCapture } from './capture';
import { emailToCapture } from './email';

/**
 * What a device posted, turned into a capture.
 *
 * This is everything `/api/capture` does between "the body is valid JSON of the
 * right shape" and "write a row", and it lives here rather than inside the
 * route so that every channel can be driven end to end in a test — the route
 * itself needs a request, a session and a database before it will run at all.
 *
 * The channels that arrive here:
 *
 *   - an iOS Shortcut from the share sheet: `url`, or `text` with the link
 *     inside it and a caption around it
 *   - the mail bridge: `via: "email"` with a `subject` and the plain-text body
 *   - the Notes app, or anything else that shares plain text
 *   - a screenshot from the share sheet or the photo library, which arrives as
 *     base64 and has already been stored by the time it gets here
 */
export interface CaptureBody {
    url?: string;
    text?: string;
    note?: string;
    via?: 'email';
    subject?: string;
    /**
     * A screenshot that has already been stored.
     */
    imageUrl?: string;
    /**
     * A screenshot as it arrives from a device: base64, not yet stored.
     *
     * Passed through as a *fact* rather than as data — the classifier is being
     * asked what was sent, and "a picture" is the answer whether or not the
     * upload has happened yet. See `hasImage` in `capture.ts` for the bug this
     * closes.
     */
    image?: { base64: string; mediaType: string };
}

/**
 * Is this actually a link?
 *
 * The `url` field arrives from a shortcut, and a shortcut hands over whatever
 * the share sheet gave it. From Safari that is a link. From Apple Notes it is
 * the note — several hundred characters of recipe — posted into a field called
 * `url` because that is the field the shortcut was built with.
 *
 * Without this check that prose became `sourceUrl`, the capture was classified
 * as a link, and the pipeline went off to fetch a web page whose address was
 * "Käsespätzle 400 g Spätzle 2 Zwiebeln…". It failed, of course, and the inbox
 * said the page could not be read — about a recipe that had arrived complete
 * and was sitting in the row.
 */
function looksLikeUrl(value: string | undefined): boolean {
    if (!value) return false;
    const text = value.trim();
    if (/\s/.test(text)) return false;
    return /^https?:\/\//i.test(text);
}

/**
 * Sorts `url` and `text` into the fields they belong in.
 *
 * Whatever was posted as a url and is not one is moved to `text`, where the
 * recipe parser will look at it — and where `classifyCapture` will still find
 * a link inside it if there is one. Nothing is discarded and nothing is
 * rejected; a share is never refused for being in the wrong box.
 */
function sorted(body: CaptureBody): CaptureBody {
    if (body.url === undefined || looksLikeUrl(body.url)) return body;

    const stray = body.url.trim();
    if (stray === '') return { ...body, url: undefined };

    // A screenshot with the clipboard in the url field — the screenshot
    // shortcut sends whatever was last copied, in case it is the post's link.
    // When it is not a link it is whatever else was copied, and that is not
    // part of this recipe.
    if (body.image || body.imageUrl) return { ...body, url: undefined };

    return {
        ...body,
        url: undefined,
        // Joined rather than replaced: a shortcut that fills in both should
        // not have one of them quietly dropped.
        text: body.text ? `${stray}\n\n${body.text}` : stray,
    };
}

export function captureInputFrom(raw: CaptureBody): ClassifiedCapture | null {
    const body = sorted(raw);
    const hasImage = Boolean(body.image) || Boolean(body.imageUrl);

    if (body.via !== 'email') return classifyCapture({ ...body, hasImage });

    // A mail arrives wrapped in forwarding headers, quote markers and a
    // signature, and its subject has been through three clients. Cleaning that
    // up here rather than in the bridge keeps the rules in one testable place —
    // the bridge is a twenty-line script living in someone's Google account,
    // and changing it means signing into that account.
    const mail = emailToCapture(body.subject ?? '', body.text ?? '');

    return classifyCapture({
        url: body.url,
        imageUrl: body.imageUrl,
        text: mail.text,
        // The subject labels the capture but is kept away from the recipe
        // parser, which would otherwise name the dish "Fwd: schau mal".
        note: body.note || mail.title || undefined,
        via: 'email',
        hasImage,
    });
}

/** At most this many screenshots per share: the post, its comments, the bio. */
export const MAX_CAPTURE_IMAGES = 4;

/** A picture's type from its first bytes, for a Shortcut that cannot say. */
export function sniffImageType(base64: string): string {
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('iVBOR')) return 'image/png';
    if (base64.startsWith('UklGR')) return 'image/webp';
    if (base64.startsWith('R0lGOD')) return 'image/gif';
    return 'image/heic';
}

/**
 * Every screenshot a device sent, in order.
 *
 * `image` is the one-picture form the Shortcut has always sent. `images` is
 * several: either a list of `{base64, mediaType}`, or — because a Shortcut
 * cannot build a list of objects but can join texts — the base64 strings
 * joined with commas (line breaks inside one are ignored).
 */
export function imagesFrom(
    body: {
        image?: { base64: string; mediaType: string };
        images?: { base64: string; mediaType: string }[] | string;
    },
    now = new Date()
): { base64: string; mediaType: string }[] {
    const list: { base64: string; mediaType: string }[] = body.image ? [body.image] : [];
    if (typeof body.images === 'string') {
        for (const part of body.images.split(',')) {
            // "2026-09-23T15:02:11+02:00|<base64>": the time the screenshot
            // was taken, from the Shortcut. Older than a few minutes is not
            // about this share — the Shortcut always sends the latest three,
            // and this is where the ones from yesterday are left out.
            const bar = part.indexOf('|');
            const taken = bar === -1 ? null : new Date(part.slice(0, bar).trim());
            if (taken && !Number.isNaN(taken.getTime()) && now.getTime() - taken.getTime() > RECENT_SCREENSHOT_MS) continue;
            const base64 = (bar === -1 ? part : part.slice(bar + 1)).replace(/\s+/g, '');
            // "data:image/jpeg;base64" is the head of a data URL, split off by the comma.
            if (base64 && !base64.startsWith('data:')) list.push({ base64, mediaType: sniffImageType(base64) });
        }
    } else if (Array.isArray(body.images)) {
        list.push(...body.images);
    }
    return list.slice(0, MAX_CAPTURE_IMAGES);
}

/** How old a screenshot may be and still belong to the share: five minutes, and one for a slow phone. */
export const RECENT_SCREENSHOT_MS = 6 * 60 * 1000;
