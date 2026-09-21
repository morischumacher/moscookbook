import { unstable_cache, revalidateTag } from 'next/cache';
import prisma from '@/lib/prisma';

/**
 * Whether a person has confirmed their address.
 *
 * One nullable timestamp, and reading it cost a database round trip on **every
 * page render for every signed-in person** — the banner that asks for
 * confirmation sits in the layout, so it ran on the front page, on every
 * recipe, on every admin screen, for the entire life of an account that was
 * confirmed in its first week.
 *
 * It is read from the database rather than from the session cookie on purpose:
 * confirming should make the banner go away on the next render, not at the next
 * sign-in. That reason survives here — the cache is cleared by the route that
 * does the confirming, so the banner still disappears immediately. What goes
 * away is asking the same question a thousand times for an answer that changes
 * once.
 *
 * Keyed per person, because the answer is.
 */

const tagFor = (userId: number) => `user-verified-${userId}`;

export function isEmailVerified(userId: number): Promise<boolean> {
    return unstable_cache(
        async () => {
            const user: { emailVerifiedAt: Date | null } | null = await prisma.user.findUnique({
                where: { id: userId },
                select: { emailVerifiedAt: true },
            });

            // A person whose row is gone is not shown a banner asking them to
            // confirm an address that no longer exists.
            return user === null || user.emailVerifiedAt !== null;
        },
        ['email-verified', String(userId)],
        { tags: [tagFor(userId)], revalidate: 3600 }
    )();
}

/** Called the moment an address is confirmed, so the banner goes at once. */
export function forgetVerified(userId: number): void {
    try {
        revalidateTag(tagFor(userId), 'max');
    } catch {
        // Outside a request there is nothing to clear.
    }
}
