import nodemailer from 'nodemailer';

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
        });

        return 'sent';
    } catch (error) {
        // Never rethrown: the caller has already decided what the person sees,
        // and it must not depend on whether a mail server was reachable.
        console.error('Could not send mail:', error);
        return 'failed';
    }
}
