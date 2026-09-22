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

export function captureInputFrom(body: CaptureBody): ClassifiedCapture | null {
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
