import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getCurrentUser } from '@/lib/auth';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { checkImageUpload, convertHeicToJpeg, normaliseUpload } from '@/lib/uploadImage';
import { failed } from '@/lib/reportServerError';

/**
 * A screenshot for a ticket or an error: what the page looked like when it
 * went wrong. Anyone signed in may send one with a ticket, so it is limited
 * per account, and stored under a name nobody can guess — a screenshot can
 * show more than its sender meant to. The file is tied to its ticket or
 * error when that is saved; one that never is, the weekly sweep removes.
 */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const limit = await rateLimitShared(`report-photo:${user.id}`, 30, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json({ message: 'That is a lot of pictures at once. Try again a little later.' }, { status: 429 });
    }

    try {
        const file = (await request.formData()).get('file');
        if (!(file instanceof File)) return NextResponse.json({ message: 'No picture received.' }, { status: 400 });

        const check = checkImageUpload({ name: file.name, type: file.type, size: file.size }, MAX_FILE_BYTES);
        if (!check.ok) {
            return NextResponse.json(
                { message: check.reason === 'too-large' ? 'The picture is larger than 4 MB.' : 'That is not a picture.' },
                { status: check.reason === 'too-large' ? 413 : 415 }
            );
        }

        const normalised = await normaliseUpload(check.filename, Buffer.from(await file.arrayBuffer()), convertHeicToJpeg);
        if (!normalised.ok) return NextResponse.json({ message: 'That is not a picture.' }, { status: 415 });

        const { buffer, filename, contentType } = normalised.image;
        const blob = await put(`reports/${filename}`, buffer, { access: 'public', contentType, addRandomSuffix: true });
        return NextResponse.json({ url: blob.url }, { status: 201 });
    } catch (error) {
        failed('Report photo upload failed:', error);
        return NextResponse.json({ message: 'The picture could not be saved.' }, { status: 500 });
    }
}
