import bcrypt from 'bcryptjs';
import prisma from './prisma';

/**
 * The password, asked for again before anything that matters.
 *
 * Every route under /api/account that changes who you are — the address mail
 * goes to, the password itself, the existence of the account — asks for the
 * current password first, and this is the one place that checks it.
 *
 * Not theatre. The session cookie lasts a fortnight, and a phone left unlocked
 * on a kitchen counter is the realistic way somebody else ends up holding one.
 * Everything else in this application is recoverable from a backup; an address
 * quietly changed to somebody else's is how an account stops being yours, and
 * a password re-entered at that moment is the cheapest thing that stands in
 * the way.
 *
 * Deliberately *not* rate-limited here. The routes that call it are, per
 * account, because this is a password check and an unlimited one is an oracle.
 */
export async function passwordMatches(userId: number, password: string): Promise<boolean> {
    const user = await prisma.user
        .findUnique({ where: { id: userId }, select: { password: true } })
        .catch(() => null);

    // No row, no match — and the same cost either way, so a deleted account
    // does not answer faster than a wrong password.
    const hash: string = user?.password ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';

    const ok = await bcrypt.compare(password, hash);

    return Boolean(user) && ok;
}
