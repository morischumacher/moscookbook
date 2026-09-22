import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { isPrismaError } from '@/lib/prismaErrors';
import { checkImageUpload, convertHeicToJpeg, normaliseUpload } from '@/lib/uploadImage';
import { deleteBlobs } from '@/lib/blobCleanup';
import { ownerScope } from '@/lib/ownership';
import { positiveIntId } from '@/lib/routeParams';

/**
 * The pictures on a cooking entry.
 *
 * A recipe with three photographs from three different kitchens is worth more
 * than one with studio photography, and this is the one place in the cookbook
 * where somebody who is not an admin writes something everybody sees. It is
 * also why the limits here are tighter than on the admin form.
 *
 * Pictures belong to an **entry** now rather than to the recipe directly. One
 * evening produces three photographs as readily as one, and while they were
 * rows of their own those three appeared as three separate occasions of
 * cooking the same dish.
 */

/**
 * What the platform will actually carry.
 *
 * This said 10 MB, and the promise was empty: a serverless function receives at
 * most 4.5 MB of request body, and anything larger is refused above our heads,
 * as a page of HTML rather than as a reason. A picture off an iPhone is bigger
 * than that, which is why adding one worked from a laptop and failed from a
 * phone with nothing to go on.
 *
 * The browser shrinks a photograph before sending it (lib/imageCompression.ts),
 * so this limit is the backstop rather than the thing anybody meets, and it
 * states a number that is true.
 */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Enough for a dish cooked several times, few enough that nobody fills a page. */
const MAX_PER_PERSON_PER_RECIPE = 12;

/** Enough for one evening photographed thoroughly. */
const MAX_PER_ENTRY = 6;

const REASONS: Record<string, { message: string; status: number }> = {
    empty: { message: 'No picture received.', status: 400 },
    'too-large': { message: `The picture is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB.`, status: 413 },
    'unsupported-type': { message: 'That is not an image we can read.', status: 415 },
};

async function recipeIdFrom(params: Promise<{ id: string }>): Promise<number | null> {
    const { id } = await params;
    return positiveIntId(id);
}

function numberParam(req: NextRequest, name: string): number | null {
    return positiveIntId(new URL(req.url).searchParams.get(name));
}

/**
 * Adds a picture.
 *
 * `entry` says which evening it belongs to. Without it a new entry for today is
 * made and the picture hung on that — which keeps "just post a photograph" a
 * single action, the way it was before entries existed, while still producing
 * the same shape of data as pressing the button first.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await recipeIdFrom(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    // Per account rather than per IP: what is being rationed is writes to the
    // blob store, and those belong to a person, not to a network. In the
    // database rather than in a Map, or the limit is per warm instance and
    // loosens exactly when load makes the platform start more of them.
    const limit = await rateLimitShared(`cookphoto:${user.id}`, 20, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'That is a lot of pictures at once. Try again a little later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const requestedEntry = numberParam(req, 'entry');

    try {
        const form = await req.formData();
        const file = form.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json({ message: 'No picture received.' }, { status: 400 });
        }

        const check = checkImageUpload(
            { name: file.name, type: file.type, size: file.size },
            MAX_FILE_BYTES
        );

        if (!check.ok) {
            const { message, status } = REASONS[check.reason];
            return NextResponse.json({ message }, { status });
        }

        // Counted before the upload, so somebody already at the limit does not
        // pay for a transfer that is about to be refused.
        const mine: number = await prisma.cookEntryPhoto.count({
            where: { entry: { recipeId, userId: user.id } },
        });

        if (mine >= MAX_PER_PERSON_PER_RECIPE) {
            return NextResponse.json(
                { message: 'You have added as many pictures to this recipe as this allows.' },
                { status: 409 }
            );
        }

        // Adding to an existing entry: it has to be one of yours. An admin is
        // not included here — hanging a picture on somebody else's evening is
        // writing in their name, which is the thing `edit` refuses.
        let entryId = requestedEntry;
        let position = 0;

        if (entryId !== null) {
            const target: { id: number; _count: { photos: number } } | null =
                await prisma.cookEntry.findFirst({
                    where: { id: entryId, recipeId, ...ownerScope(user, 'edit') },
                    select: { id: true, _count: { select: { photos: true } } },
                });

            if (!target) {
                return NextResponse.json({ message: 'Not yours to add to.' }, { status: 403 });
            }

            if (target._count.photos >= MAX_PER_ENTRY) {
                return NextResponse.json(
                    { message: 'That entry already has as many pictures as it holds.' },
                    { status: 409 }
                );
            }

            position = target._count.photos;
        }

        /*
         * Admitted by its bytes, not by its name or its declared type — both
         * of which the uploader wrote. See lib/uploadImage: a `photo.jpg`
         * that is HTML used to be stored as image/jpeg on the word of the
         * person uploading it.
         */
        const normalised = await normaliseUpload(
            check.filename,
            Buffer.from(await file.arrayBuffer()),
            convertHeicToJpeg
        );

        if (!normalised.ok) {
            return NextResponse.json({ message: 'That file is not a picture.' }, { status: 415 });
        }

        const { buffer, filename, contentType } = normalised.image;

        const blob = await put(`cooked_${Date.now()}_${filename}`, buffer, {
            access: 'public',
            contentType,
        });

        // The entry is made only now, after the upload has succeeded. Made
        // before it, a failed transfer would leave an empty evening behind
        // saying somebody cooked this when nobody said so.
        if (entryId === null) {
            const created: { id: number } = await prisma.cookEntry.create({
                data: { recipeId, userId: user.id },
                select: { id: true },
            });
            entryId = created.id;
        }

        const photo: { id: number; url: string; position: number; createdAt: Date } =
            await prisma.cookEntryPhoto.create({
                data: { url: blob.url, position, entryId },
                select: { id: true, url: true, position: true, createdAt: true },
            });

        return NextResponse.json({ ...photo, entryId }, { status: 201 });
    } catch (error) {
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 404 });
        }

        console.error('Cooked-photo upload failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/** Takes one picture off an entry. Its author, or an admin. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await recipeIdFrom(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const photoId = numberParam(req, 'photo');
    if (photoId === null) return NextResponse.json({ message: 'Which picture?' }, { status: 400 });

    // The permission is on the entry the picture hangs on, reached through the
    // relation, so it is the same single rule rather than a second copy of it.
    const where = {
        id: photoId,
        entry: { recipeId, ...ownerScope(user, 'delete') },
    };

    try {
        const doomed: { url: string } | null = await prisma.cookEntryPhoto.findFirst({
            where,
            select: { url: true },
        });

        const removed: { count: number } = await prisma.cookEntryPhoto.deleteMany({ where });

        if (removed.count === 1 && doomed) await deleteBlobs([doomed.url]);

        return NextResponse.json({ success: true, removed: removed.count });
    } catch (error) {
        console.error('Cooked-photo deletion failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
