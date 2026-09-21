import prisma from './prisma';
import { getSiteUrl } from './siteUrl';
import { sendMail, type SendResult } from './mailer';
import { resetMail, verifyMail } from './authMail';
import {
    generateToken,
    hashToken,
    expiryFor,
    tokenUrl,
    type TokenPurpose,
} from './authTokens';

/**
 * Mint a token, mail it, and make every earlier one of the same kind useless.
 *
 * The invalidation is the part worth being deliberate about. Someone who clicks
 * "forgot my password" three times because nothing seems to be happening ends
 * up with three live keys to their account sitting in a mailbox; only the newest
 * should work. Marking the older ones used rather than deleting them also means
 * a second click on an old link says "this link has expired" instead of "unknown
 * link", which is the truth and reads far less alarming.
 *
 * The plain token is never returned or logged. It exists inside this function
 * and inside the message, and nowhere else.
 */
export async function issueToken(
    user: { id: number; email: string; name: string },
    purpose: TokenPurpose,
    locale: string
): Promise<SendResult> {
    const token = generateToken();
    const now = new Date();

    await prisma.authToken.updateMany({
        where: { userId: user.id, purpose, usedAt: null },
        data: { usedAt: now },
    });

    await prisma.authToken.create({
        data: {
            tokenHash: hashToken(token),
            purpose,
            userId: user.id,
            expiresAt: expiryFor(purpose, now),
        },
    });

    const url = tokenUrl(getSiteUrl(), locale, purpose === 'reset' ? 'reset' : 'verify', token);

    const mail =
        purpose === 'reset'
            ? resetMail(user.email, user.name, url, locale)
            : verifyMail(user.email, user.name, url, locale);

    const result = await sendMail(mail);

    if (result !== 'sent') {
        // The row stays. A token nobody received simply expires, and leaving it
        // keeps this function free of the question "did the mail server answer
        // before or after the write".
        console.warn(`[auth] ${purpose} mail for user ${user.id}: ${result}`);
    }

    return result;
}
