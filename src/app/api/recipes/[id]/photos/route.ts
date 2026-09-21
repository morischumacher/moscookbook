import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
// @ts-expect-error - heic-convert ships no type declarations
import convert from 'heic-convert';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { isPrismaError } from '@/lib/prismaErrors';
import { checkImageUpload, looksLikeHeic } from '@/lib/uploadImage';
import { deleteBlobs } from '@/lib/blobCleanup';

/**
 * "Nachgekocht" — a photograph of the dish as somebody actually made it.
 *
 * This is the one place in the cookbook where a guest writes something that
 * everybody else sees, and that is the whole reason it exists: a recipe with
 * three pictures from three different kitchens is worth more than one with
 * studio photography. It is also why the limits here are tighter than on the
 * admin form.
 *
 * Anyone with an account may add one. Deleting is for the person who uploaded
 * it and for an admin, and for nobody else — a shared wall where anyone can
 * remove anyone's picture is not a shared wall.
 */

/** Smaller than the admin form's 15 MB: these are snapshots, not the recipe's own photography. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Enough for a dish cooked several times, few enough that nobody fills a page. */
const MAX_PER_PERSON_PER_RECIPE = 12;

const REASONS: Record<string, { message: string; status: number }> = {
    empty: { message: 'No picture received.', status: 400 },
    'too-large': { message: `The picture is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB.`, status: 413 },
    'unsupported-type': { message: 'That is not an image we can read.', status: 415 },
};

async function recipeId(params: Promise<{ id: string }>): Promise<number | null> {
    const { id } = await params;
    const parsed = Number.parseInt(id, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const id = await recipeId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });

    // Per account rather than per IP: what is being rationed is writes to the
    // Blob store, and those belong to a person, not to a network.
    const limit = rateLimit(`cookphoto:${user.id}`, 20, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'That is a lot of pictures at once. Try again a little later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    try {
        const form = await req.formData();
        const file = form.get('file');
        const rawCaption = form.get('caption');

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

        // Counted before the upload, so a person who is already at the limit
        // does not pay for a transfer that is about to be refused.
        const mine = await prisma.cookPhoto.count({ where: { recipeId: id, userId: user.id } });
        if (mine >= MAX_PER_PERSON_PER_RECIPE) {
            return NextResponse.json(
                { message: 'You have added as many pictures to this recipe as this allows.' },
                { status: 409 }
            );
        }

        let buffer = Buffer.from(await file.arrayBuffer());
        let filename = check.filename;
        let contentType = file.type || 'application/octet-stream';

        if (looksLikeHeic(buffer)) {
            const converted = await convert({
                buffer: buffer as unknown as ArrayBufferLike,
                format: 'JPEG',
                quality: 0.8,
            });
            buffer = Buffer.from(converted as ArrayBuffer);
            filename = filename.replace(/\.(heic|heif)$/i, '') + '.jpg';
            contentType = 'image/jpeg';
        }

        const blob = await put(`cooked_${Date.now()}_${filename}`, buffer, {
            access: 'public',
            contentType,
        });

        const caption =
            typeof rawCaption === 'string' && rawCaption.trim() !== ''
                ? rawCaption.trim().slice(0, 140)
                : null;

        const photo = await prisma.cookPhoto.create({
            data: { url: blob.url, caption, recipeId: id, userId: user.id },
            select: { id: true, url: true, caption: true, createdAt: true },
        });

        return NextResponse.json(photo, { status: 201 });
    } catch (error) {
        // A recipe deleted between opening the page and pressing the button.
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 404 });
        }

        console.error('Cooked-photo upload failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * The note under a picture.
 *
 * Only the person who put the picture there, admin or not: a caption is
 * somebody speaking, and an admin who can delete a photograph still has no
 * business rewriting what its owner said about it. Deleting it whole is the
 * moderation an admin gets.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const id = await recipeId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });

    const photoId = Number.parseInt(new URL(req.url).searchParams.get('photo') ?? '', 10);
    if (Number.isNaN(photoId)) {
        return NextResponse.json({ message: 'Which picture?' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const raw = typeof body?.caption === 'string' ? body.caption.trim() : '';
    const caption = raw === '' ? null : raw.slice(0, 140);

    try {
        // Ownership in the WHERE clause again, so there is no window between
        // asking who owns it and writing to it.
        const updated = await prisma.cookPhoto.updateMany({
            where: { id: photoId, recipeId: id, userId: user.id },
            data: { caption },
        });

        if (updated.count !== 1) {
            return NextResponse.json({ message: 'Not yours to caption.' }, { status: 403 });
        }

        return NextResponse.json({ success: true, caption });
    } catch (error) {
        console.error('Cooked-photo caption failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const id = await recipeId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });

    const photoId = Number.parseInt(new URL(req.url).searchParams.get('photo') ?? '', 10);
    if (Number.isNaN(photoId)) {
        return NextResponse.json({ message: 'Which picture?' }, { status: 400 });
    }

    try {
        // Read before the delete, and only the row this person is allowed to
        // delete — the same condition, so a photograph somebody may not touch
        // never has its URL looked at either.
        const doomed: { url: string } | null = await prisma.cookPhoto.findFirst({
            where: {
                id: photoId,
                recipeId: id,
                ...(user.admin ? {} : { userId: user.id }),
            },
            select: { url: true },
        });

        // The ownership check is in the WHERE clause, not in an `if` above it:
        // a guest can only ever match their own rows, an admin matches any, and
        // there is no window between reading who owns it and deleting it.
        const removed = await prisma.cookPhoto.deleteMany({
            where: {
                id: photoId,
                recipeId: id,
                ...(user.admin ? {} : { userId: user.id }),
            },
        });

        // Not 404 or 403 — telling somebody which of the two it is tells them
        // whether a picture they may not touch exists. The end state they asked
        // for is "that picture is not mine to see any more", and it holds.
        if (removed.count === 1 && doomed) await deleteBlobs([doomed.url]);

        return NextResponse.json({ success: true, removed: removed.count });
    } catch (error) {
        console.error('Cooked-photo deletion failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
