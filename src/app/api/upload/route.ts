import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/auth';
import { checkImageUpload, convertHeicToJpeg, normaliseUpload } from '@/lib/uploadImage';

/**
 * The admin form's upload: a recipe's own photography.
 *
 * The rules for what counts as an image live in src/lib/uploadImage.ts, shared
 * with the pictures people add to a recipe they have cooked, so a trusted
 * uploader and an ordinary one cannot drift on to different definitions of a
 * safe file. Only the size limit differs.
 */

/**
 * 4 MB, not the 15 this used to claim: a serverless function is handed at most
 * 4.5 MB of request body and the platform refuses the rest before this file
 * runs, so a larger number here was a promise made by the wrong party. The
 * form shrinks a picture in the browser first (lib/imageCompression.ts), which is
 * both what keeps this from being met and what the site wanted anyway — no
 * page here displays an image wider than about a thousand pixels.
 */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
    // Uploads write to the project's Blob store and cost money, so this
    // endpoint is admin-only just like recipe creation.
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json({ message: 'No file received.' }, { status: 400 });
        }

        const check = checkImageUpload(
            { name: file.name, type: file.type, size: file.size },
            MAX_FILE_BYTES
        );

        if (!check.ok) {
            const messages = {
                empty: { message: 'No file received.', status: 400 },
                'too-large': {
                    message: `File is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
                    status: 413,
                },
                'unsupported-type': {
                    message: 'Unsupported file type. Please upload an image.',
                    status: 415,
                },
            } as const;

            // `{ message }`, like the other forty-eight routes. This was the one
            // that said `{ error }`, and the form reading it had to know.
            const { message, status } = messages[check.reason];
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

        const { buffer, filename: finalFilename, contentType } = normalised.image;

        const blob = await put(`${Date.now()}_${finalFilename}`, buffer, {
            access: 'public',
            contentType,
        });

        return NextResponse.json({ success: true, url: blob.url });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ message: 'Upload failed' }, { status: 500 });
    }
}
