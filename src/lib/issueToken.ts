import prisma from './prisma';
import { getSiteUrl } from './siteUrl';
import { sendMail, type SendResult } from './mailer';
import { confirmEmailMail, resetMail, verifyMail } from './authMail';
import {
    generateToken,
    hashToken,
    expiryFor,
    tokenUrl,
    type TokenPurpose,
} from './authTokens';

/**
 * Mint a token and mail it. An earlier verify link is made useless; an
 * earlier reset link is not.
 *
 * Reset links used to be replaced too, so that three clicks on "forgot my
 * password" left one live key in the mailbox rather than three. But anybody
 * can ask for a reset for any address, so anybody could cancel the link the
 * owner had just been sent, as often as they liked. Three live links in one
 * mailbox are no more dangerous than one — whoever reads that mailbox can ask
 * for another anyway — and redeeming any of them ends the rest. A used or
 * replaced link still says "this link has expired" rather than "unknown link".
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

    // An earlier reset link stays good until it runs out: requested by
    // somebody else, a new one used to cancel the one the owner had just
    // been sent — again and again. Setting a password ends them all (the
    // reset route). A verify link is still replaced: it has no such race.
    if (purpose !== 'reset') {
        await prisma.authToken.updateMany({
            where: { userId: user.id, purpose, usedAt: null },
            data: { usedAt: now },
        });
    }

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
            : purpose === 'email'
              ? confirmEmailMail(user.email, user.name, url, locale)
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
