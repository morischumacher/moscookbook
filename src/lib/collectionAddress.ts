import prisma from '@/lib/prisma';
import { collectionSlug } from '@/lib/collectionSchema';

/**
 * A slug nothing else is using.
 *
 * Two collections called "Weihnachten" is not a mistake — one is last year's —
 * so the second one gets a number rather than an error. The loop is bounded
 * because an unbounded one is a way to hang a request.
 */
export async function freeSlug(title: string, ownId?: number): Promise<string> {
    const base = collectionSlug(title);

    for (let suffix = 0; suffix < 50; suffix += 1) {
        const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
        if (!(await slugTaken(candidate, ownId))) return candidate;
    }

    // Fifty collections with one name is not a case worth a nicer answer.
    return `${base}-${Date.now()}`;
}

/** Whether another collection lives at this address. Its own does not count. */
export async function slugTaken(slug: string, ownId?: number): Promise<boolean> {
    const found = await prisma.collection.findUnique({ where: { slug }, select: { id: true } });
    return Boolean(found && found.id !== ownId);
}
