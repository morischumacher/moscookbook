import prisma from './prisma';
import type { PersonName } from './inviteName';

/**
 * Every name already given out: the accounts, and the invitations nobody has
 * used yet (a name promised is a name taken). An account from before first and
 * last names were separate has only `name`; its first word is its first name.
 */
export async function takenNames(): Promise<PersonName[]> {
    const [users, invites] = await Promise.all([
        prisma.user.findMany({ select: { name: true, firstName: true, lastName: true } }),
        prisma.invite.findMany({
            where: { usedAt: null, expiresAt: { gt: new Date() }, firstName: { not: null } },
            select: { firstName: true, lastName: true },
        }),
    ]);

    return [
        ...users.map((user: { name: string; firstName: string; lastName: string }) =>
            user.firstName
                ? { firstName: user.firstName, lastName: user.lastName }
                : { firstName: user.name.split(/\s+/)[0] ?? '', lastName: user.name.split(/\s+/).slice(1).join(' ') }
        ),
        ...invites.map((invite: { firstName: string | null; lastName: string | null }) => ({
            firstName: invite.firstName ?? '',
            lastName: invite.lastName ?? '',
        })),
    ];
}
