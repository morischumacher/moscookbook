import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';
import { deleteBlobs } from '@/lib/blobCleanup';
import { ownerScope } from '@/lib/ownership';

/**
 * "I cooked this" — the entry itself. Its photographs are in ./photos.
 *
 * One tap makes the entry: no dialog, no date picker, no form. The note and
 * the pictures come afterwards, because anything standing between the fact and
 * the button means the fact does not get recorded, and the fact is the part
 * worth having.
 *
 * This replaces two routes that did the same job — one for a photograph, one
 * for a note — with two different permission rules between them. There is one
 * rule now and it lives in lib/ownership.ts: **the author writes, the admin
 * removes.** Everybody with an account reads everything here, so an entry is a
 * contribution to a shared page rather than a private diary, and it is
 * moderated the way a shared page has to be. Rewriting it is another matter:
 * no amount of being the admin makes it reasonable to put words in somebody
 * else's mouth under their name.
 */

/** Long enough for "half the chilli, and 10 minutes less", short enough not to be an essay. */
const MAX_NOTE = 280;

async function recipeIdFrom(params: Promise<{ id: string }>): Promise<number | null> {
    const { id } = await params;
    const parsed = Number.parseInt(id, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function entryIdFrom(req: NextRequest): number | null {
    const parsed = Number.parseInt(new URL(req.url).searchParams.get('entry') ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function noteFrom(body: unknown): string | null {
    const raw = typeof (body as { note?: unknown })?.note === 'string'
        ? (body as { note: string }).note.trim()
        : '';
    return raw === '' ? null : raw.slice(0, MAX_NOTE);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await recipeIdFrom(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const note = noteFrom(await req.json().catch(() => null));

    try {
        const entry: { id: number; cookedAt: Date; note: string | null } =
            await prisma.cookEntry.create({
                data: { recipeId, userId: user.id, note },
                select: { id: true, cookedAt: true, note: true },
            });

        return NextResponse.json({ ...entry, photos: [] }, { status: 201 });
    } catch (error) {
        // The recipe was deleted between the page rendering and the tap.
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 404 });
        }

        console.error('Cook entry failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * The note on an entry. Its author, admin or not — see the note on ownerScope.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await recipeIdFrom(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const entryId = entryIdFrom(req);
    if (entryId === null) return NextResponse.json({ message: 'Which entry?' }, { status: 400 });

    const note = noteFrom(await req.json().catch(() => null));

    try {
        // The permission is inside the query, not in an `if` above it: there is
        // no window between asking whose entry it is and writing to it.
        const updated: { count: number } = await prisma.cookEntry.updateMany({
            where: { id: entryId, recipeId, ...ownerScope(user, 'edit') },
            data: { note },
        });

        if (updated.count !== 1) {
            return NextResponse.json({ message: 'Not yours to write on.' }, { status: 403 });
        }

        return NextResponse.json({ success: true, note });
    } catch (error) {
        console.error('Cook note failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * Takes an entry down, with whatever pictures hang on it.
 *
 * Its author, or an admin. This used to be the author alone, justified by the
 * entry being "one person's record of their own evening" — which described
 * something private, while every account could read every word of it. A page
 * everyone reads needs somebody able to take down what does not belong on it.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await recipeIdFrom(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const entryId = entryIdFrom(req);
    if (entryId === null) return NextResponse.json({ message: 'Which entry?' }, { status: 400 });

    const where = { id: entryId, recipeId, ...ownerScope(user, 'delete') };

    try {
        // Read under the same condition as the delete, so an entry this person
        // may not touch never has its picture URLs looked at either.
        const doomed: { photos: { url: string }[] } | null = await prisma.cookEntry.findFirst({
            where,
            select: { photos: { select: { url: true } } },
        });

        const removed: { count: number } = await prisma.cookEntry.deleteMany({ where });

        // The rows go with the entry by cascade; the files in the blob store do
        // not, and an orphaned blob is billed for ever.
        if (removed.count === 1 && doomed && doomed.photos.length > 0) {
            await deleteBlobs(doomed.photos.map((photo) => photo.url));
        }

        // Not 404 or 403: telling somebody which of the two it is tells them
        // whether an entry they may not touch exists. The end state they asked
        // for — "that entry is not there any more" — holds either way. The same
        // reasoning the photographs have always used.
        return NextResponse.json({ success: true, removed: removed.count });
    } catch (error) {
        console.error('Cook entry deletion failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
