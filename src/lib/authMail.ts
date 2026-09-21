import { TOKEN_LIFETIME_MINUTES } from './authTokens';
import type { Mail } from './mailer';

/**
 * The two messages this cookbook sends.
 *
 * Written as pure functions so they can be tested without a mail server: the
 * things that actually go wrong with transactional mail — a link that is not in
 * the body, a German message signed in English, an expiry the text contradicts —
 * are all visible in the returned strings.
 *
 * Plain text is the real message and HTML is the decoration. Mail clients that
 * show the text part are not exotic, and a reset link that only exists inside a
 * styled table is a reset link some people cannot use.
 */

type Locale = 'en' | 'de';

function locale(value: string): Locale {
    return value === 'de' ? 'de' : 'en';
}

function hours(minutes: number): number {
    return Math.round(minutes / 60);
}

function days(minutes: number): number {
    return Math.round(minutes / (60 * 24));
}

/**
 * Minimal HTML. No images, no external stylesheet, no web font: a message that
 * needs the network to be readable is a message that looks broken in every
 * client that blocks remote content by default, which is most of them.
 *
 * The link is also written out as text underneath, because a button whose href
 * a client rewrites or strips leaves nothing to fall back on.
 */
function wrap(heading: string, body: string, action: string, url: string, footer: string): string {
    const escape = (value: string) =>
        value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return [
        '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;max-width:34rem;margin:0 auto;padding:24px">',
        `<h1 style="font-size:20px;margin:0 0 16px">${escape(heading)}</h1>`,
        `<p style="margin:0 0 20px">${escape(body)}</p>`,
        `<p style="margin:0 0 20px"><a href="${escape(url)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px">${escape(action)}</a></p>`,
        `<p style="margin:0 0 20px;font-size:13px;color:#4B5563;word-break:break-all">${escape(url)}</p>`,
        `<p style="margin:0;font-size:13px;color:#4B5563">${escape(footer)}</p>`,
        '</div>',
    ].join('');
}

export function resetMail(to: string, name: string, url: string, localeCode: string): Mail {
    const language = locale(localeCode);
    const validFor = hours(TOKEN_LIFETIME_MINUTES.reset);

    if (language === 'de') {
        const heading = 'Passwort zurücksetzen';
        const body = `Hallo ${name}, über den folgenden Link kannst du ein neues Passwort für mo'scookbook setzen.`;
        // Said plainly rather than as a warning: someone who did not ask for
        // this has nothing to do, and telling them to "secure their account"
        // when nothing has happened only frightens them.
        const footer = `Der Link gilt ${validFor} Stunde${validFor === 1 ? '' : 'n'}. Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren — dein Passwort bleibt unverändert.`;

        return {
            to,
            subject: "mo'scookbook: Passwort zurücksetzen",
            text: `${heading}\n\n${body}\n\n${url}\n\n${footer}\n`,
            html: wrap(heading, body, 'Neues Passwort setzen', url, footer),
        };
    }

    const heading = 'Reset your password';
    const body = `Hello ${name}, you can set a new password for mo'scookbook with the link below.`;
    const footer = `The link is valid for ${validFor} hour${validFor === 1 ? '' : 's'}. If you did not ask for this, you can ignore this e-mail — your password stays as it is.`;

    return {
        to,
        subject: "mo'scookbook: reset your password",
        text: `${heading}\n\n${body}\n\n${url}\n\n${footer}\n`,
        html: wrap(heading, body, 'Set a new password', url, footer),
    };
}

export function verifyMail(to: string, name: string, url: string, localeCode: string): Mail {
    const language = locale(localeCode);
    const validFor = days(TOKEN_LIFETIME_MINUTES.verify);

    if (language === 'de') {
        const heading = 'E-Mail-Adresse bestätigen';
        const body = `Hallo ${name}, willkommen bei mo'scookbook. Bestätige bitte kurz deine Adresse — danach kannst du dein Passwort jederzeit selbst zurücksetzen.`;
        const footer = `Der Link gilt ${validFor} Tage.`;

        return {
            to,
            subject: "mo'scookbook: E-Mail-Adresse bestätigen",
            text: `${heading}\n\n${body}\n\n${url}\n\n${footer}\n`,
            html: wrap(heading, body, 'Adresse bestätigen', url, footer),
        };
    }

    const heading = 'Confirm your e-mail address';
    const body = `Hello ${name}, welcome to mo'scookbook. Please confirm your address — that is what lets you reset your own password later.`;
    const footer = `The link is valid for ${validFor} days.`;

    return {
        to,
        subject: "mo'scookbook: confirm your e-mail address",
        text: `${heading}\n\n${body}\n\n${url}\n\n${footer}\n`,
        html: wrap(heading, body, 'Confirm my address', url, footer),
    };
}
