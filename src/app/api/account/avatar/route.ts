import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { checkImageUpload, convertHeicToJpeg, normaliseUpload } from '@/lib/uploadImage';
import { deleteBlobs } from '@/lib/blobCleanup';

/**
 * Your own picture, and nobody else's.
 *
 * There is no id in this route on purpose. Every other upload here names the
 * thing it belongs to and then checks the caller may touch it; this one is
 * about the caller, so the session *is* the subject and there is no parameter
 * to get wrong. An admin cannot change somebody's face either, and that is not
 * an oversight — a picture of a person under their own name is the one thing
 * in this application that only they should be able to set.
 */

/**
 * Small, because it is shown at 40 pixels and occasionally at 96.
 *
 * The browser shrinks it to 512 before sending (see the account page), so this
 * is the backstop, and it is well under the 4.5 MB a serverless function can
 * receive at all.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const REASONS: Record<string, { message: string; status: number }> = {
    empty: { message: 'No picture received.', status: 400 },
    'too-large': { message: `The picture is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB.`, status: 413 },
    'unsupported-type': { message: 'That is not an image we can read.', status: 415 },
};

export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const limit = await rateLimitShared(`avatar:${user.id}`, 12, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'That is a lot of pictures at once. Try again a little later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

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

        // Read before the write, so the file being replaced can be removed
        // afterwards. Not before: a delete that ran first and then failed to
        // upload would leave somebody with no picture and no way back.
        const before: { avatarUrl: string | null } | null = await prisma.user.findUnique({
            where: { id: user.id },
            select: { avatarUrl: true },
        });

        const blob = await put(`avatar_${user.id}_${Date.now()}_${filename}`, buffer, {
            access: 'public',
            contentType,
        });

        await prisma.user.update({
            where: { id: user.id },
            data: { avatarUrl: blob.url },
        });

        if (before?.avatarUrl && before.avatarUrl !== blob.url) {
            await deleteBlobs([before.avatarUrl]);
        }

        return NextResponse.json({ avatarUrl: blob.url }, { status: 201 });
    } catch (error) {
        console.error('Avatar upload failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/** Taking it down again. Initials are a perfectly good answer. */
export async function DELETE() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    try {
        const before: { avatarUrl: string | null } | null = await prisma.user.findUnique({
            where: { id: user.id },
            select: { avatarUrl: true },
        });

        await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });

        // The row first, the file second: a file deleted before the row would
        // leave a URL pointing at nothing, which renders as a broken image.
        // The other way round leaves at worst an unreferenced file, and the
        // weekly sweep collects those.
        if (before?.avatarUrl) await deleteBlobs([before.avatarUrl]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Avatar removal failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
