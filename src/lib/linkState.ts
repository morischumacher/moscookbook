import prisma from './prisma';
import { hashToken, tokenState, type TokenPurpose, type TokenState } from './authTokens';
import { inviteState, type InviteState } from './invite';

/**
 * Is this link still worth showing a form for?
 *
 * The reset page used to render the form whatever the link was, and only say
 * "this link is no longer valid" after somebody had chosen a password, typed
 * it twice and pressed the button. Opening a used link a second time — which
 * people do, because the mail is still sitting in the inbox — looked exactly
 * like opening a good one.
 *
 * That is the wrong order. A form is a promise that filling it in will do
 * something, and a form that cannot work should not be drawn. Worse, the
 * person has by then invented a password and may believe it is set.
 *
 * So the state is read before the page renders. This is only ever a *read*:
 * the token is still redeemed by the single conditional UPDATE in the API
 * route, which is what makes two taps on one link produce one winner. Marking
 * it used here would burn the link on a page view — and mail clients fetch the
 * URLs in a message to preview them.
 *
 * Knowing the answer tells whoever holds the link whether it works, which is
 * what the link is for. The token is 32 random bytes, so there is nothing to
 * guess at and nothing to enumerate.
 */
export async function linkState(
    token: string | undefined,
    purpose: TokenPurpose,
    now = new Date()
): Promise<TokenState | 'missing'> {
    if (!token) return 'missing';

    try {
        const record = await prisma.authToken.findUnique({
            where: { tokenHash: hashToken(token) },
            select: { purpose: true, expiresAt: true, usedAt: true },
        });

        return tokenState(record, purpose, now);
    } catch (error) {
        // A database that is not answering must not turn a reset page into an
        // error page: the form still works, and the API route makes the real
        // decision a moment later. Reporting "valid" here is optimistic on
        // purpose — it is the one answer that costs nothing if it is wrong.
        console.error('Could not read link state:', error);
        return 'valid';
    }
}

/**
 * The same question for an invitation.
 *
 * The registration page had the identical flaw and a worse version of it: it
 * asked only whether an `invite` parameter was *present*, never whether it
 * still worked. Somebody opening a spent invitation typed a first name, a last
 * name, an address and a password before being told the invitation had already
 * been used — by them, a month earlier, which is why they still had the mail.
 *
 * A read, like the one above. The invitation is claimed by the conditional
 * UPDATE in the registration route, and that is what decides.
 */
export async function inviteLinkState(
    code: string | undefined,
    now = new Date()
): Promise<InviteState | 'missing'> {
    if (!code) return 'missing';

    try {
        const record = await prisma.invite.findUnique({
            where: { code },
            select: { id: true, usedAt: true, expiresAt: true },
        });

        return inviteState(record, now);
    } catch (error) {
        console.error('Could not read invitation state:', error);
        return 'valid';
    }
}

/** The name an invitation was made for, to fill into the registration form. */
export async function inviteName(code: string | undefined): Promise<{ firstName: string | null; lastName: string | null }> {
    if (!code) return { firstName: null, lastName: null };
    const record = await prisma.invite
        .findUnique({ where: { code }, select: { firstName: true, lastName: true } })
        .catch(() => null);
    return { firstName: record?.firstName ?? null, lastName: record?.lastName ?? null };
}
