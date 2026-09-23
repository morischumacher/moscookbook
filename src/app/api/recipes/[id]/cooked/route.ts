import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { isPrismaError } from '@/lib/prismaErrors';
import { deleteBlobs } from '@/lib/blobCleanup';
import { ownerScope } from '@/lib/ownership';
import { idFrom, refuse, route } from '@/lib/route';
import { hiddenFrom } from '@/lib/recipeVisibilityDb';

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

/**
 * A note, as the form sends it: optional, trimmed, and cut to length rather
 * than refused — a note typed at the stove that runs long should still save.
 * An empty one is stored as no note.
 */
const noteBody = z.object({
    note: z
        .string()
        .nullish()
        .transform((value) => {
            const trimmed = (value ?? '').trim();
            return trimmed === '' ? null : trimmed.slice(0, MAX_NOTE);
        }),
});

type Params = { id: string };

export const POST = route<'user', typeof noteBody, Params>(
    { access: 'user', body: noteBody, label: 'Cook entry' },
    async ({ user, params, body }) => {
        const recipeId = idFrom(params.id, 'recipe ID');
        // An "only me" recipe answers as a missing one would.
        if (await hiddenFrom(recipeId, user)) refuse(404, 'Recipe not found');

        try {
            const entry: { id: number; cookedAt: Date; note: string | null } =
                await prisma.cookEntry.create({
                    data: { recipeId, userId: user.id, note: body.note },
                    select: { id: true, cookedAt: true, note: true },
                });

            return NextResponse.json({ ...entry, photos: [] }, { status: 201 });
        } catch (error) {
            // The recipe was deleted between the page rendering and the tap.
            if (isPrismaError(error, 'P2003')) refuse(404, 'That recipe no longer exists.');
            throw error;
        }
    }
);

export const PATCH = route<'user', typeof noteBody, Params>(
    { access: 'user', body: noteBody, label: 'Cook note' },
    async ({ req, user, params, body }) => {
        const recipeId = idFrom(params.id, 'recipe ID');
        const entryId = idFrom(new URL(req.url).searchParams.get('entry'), 'entry');

        // The permission is inside the query, not in an `if` above it: there is
        // no window between asking whose entry it is and writing to it.
        const updated: { count: number } = await prisma.cookEntry.updateMany({
            where: { id: entryId, recipeId, ...ownerScope(user, 'edit') },
            data: { note: body.note },
        });

        if (updated.count !== 1) refuse(403, 'Not yours to write on.');

        return NextResponse.json({ success: true, note: body.note });
    }
);

export const DELETE = route<'user', undefined, Params>(
    { access: 'user', label: 'Cook entry deletion' },
    async ({ req, user, params }) => {
        const recipeId = idFrom(params.id, 'recipe ID');
        const entryId = idFrom(new URL(req.url).searchParams.get('entry'), 'entry');

        const where = { id: entryId, recipeId, ...ownerScope(user, 'delete') };

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
    }
);
