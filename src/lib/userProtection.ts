import prisma from './prisma';

/**
 * Accounts that cannot be demoted or deleted from the people list.
 *
 * - **The owner**: the oldest admin account — the one that set the cookbook
 *   up. No other admin can take its rights away or delete it; an admin who
 *   was invited and promoted must not be able to lock out the person whose
 *   cookbook it is.
 * - **Yourself**: from this list, never — your own account is left on the
 *   account page, where the password is asked for.
 * - **The last admin**: without one, nobody could reach the admin area again.
 */
export async function ownerId(): Promise<number | null> {
    const owner = await prisma.user.findFirst({ where: { admin: true }, orderBy: { id: 'asc' }, select: { id: true } });
    return owner?.id ?? null;
}

export { protectionOf, type Protection } from './protection';
