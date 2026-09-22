import nodemailer from 'nodemailer';
import { BRAND_MARK_CID, BRAND_MARK_PNG_BASE64 } from './brandMark';

/**
 * Sending mail.
 *
 * Gmail's SMTP with an app password, because it is two minutes of setup on an
 * account that already exists, costs nothing, and needs no domain verification.
 * Its limits — a few hundred messages a day — are far beyond what a personal
 * cookbook sends.
 *
 * Everything that sends goes through here, so swapping to a proper delivery
 * service later is one file rather than a search through the codebase.
 *
 * The important behaviour is the one for when nothing is configured: sending
 * reports `notConfigured` rather than throwing. A cookbook whose password reset
 * is not set up should still serve recipes, and the caller decides what to tell
 * the person.
 */

export type SendResult = 'sent' | 'notConfigured' | 'failed';

interface MailSettings {
    user: string;
    password: string;
    from: string;
}

function settings(): MailSettings | null {
    const user = process.env.GMAIL_USER;
    const password = process.env.GMAIL_APP_PASSWORD;

    if (!user || !password) return null;

    return {
        user,
        password,
        // A display name so the message does not arrive looking like a machine.
        from: process.env.MAIL_FROM || `mo'scookbook <${user}>`,
    };
}

export function isMailConfigured(): boolean {
    return settings() !== null;
}

export interface Mail {
    to: string;
    subject: string;
    /** Plain text. Always sent, and always the source of truth. */
    text: string;
    /** Optional HTML. Kept simple on purpose — see the templates. */
    html?: string;
}

/**
 * The wordmark, attached when the message asks for it.
 *
 * Decided here rather than by each template, and from the HTML rather than
 * from a flag: a template that writes `cid:…` into its markup has already said
 * it wants the picture, and a separate `attachLogo: true` beside it is a
 * second place to forget. Forgetting it would produce a broken-image icon in
 * every client, which is worse than no logo at all.
 *
 * `contentDisposition: 'inline'` is what keeps it out of the paperclip:
 * without it, clients list the mark as a downloadable attachment and the
 * message looks like it is carrying a file.
 */
function inlineAttachments(html: string | undefined) {
    if (!html || !html.includes(`cid:${BRAND_MARK_CID}`)) return undefined;

    return [
        {
            filename: 'moscookbook.png',
            content: Buffer.from(BRAND_MARK_PNG_BASE64, 'base64'),
            contentType: 'image/png',
            cid: BRAND_MARK_CID,
            contentDisposition: 'inline' as const,
        },
    ];
}

export async function sendMail(mail: Mail): Promise<SendResult> {
    const config = settings();
    if (!config) return 'notConfigured';

    try {
        const transport = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: config.user, pass: config.password },
        });

        await transport.sendMail({
            from: config.from,
            to: mail.to,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            attachments: inlineAttachments(mail.html),
        });

        return 'sent';
    } catch (error) {
        // Never rethrown: the caller has already decided what the person sees,
        // and it must not depend on whether a mail server was reachable.
        console.error('Could not send mail:', error);
        return 'failed';
    }
}
