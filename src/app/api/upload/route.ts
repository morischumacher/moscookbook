import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
// @ts-expect-error - heic-convert ships no type declarations
import convert from 'heic-convert';
import { requireAdmin } from '@/lib/auth';
import { checkImageUpload, looksLikeHeic } from '@/lib/uploadImage';

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
            return NextResponse.json({ error: 'No file received.' }, { status: 400 });
        }

        const check = checkImageUpload(
            { name: file.name, type: file.type, size: file.size },
            MAX_FILE_BYTES
        );

        if (!check.ok) {
            const messages = {
                empty: { error: 'No file received.', status: 400 },
                'too-large': {
                    error: `File is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
                    status: 413,
                },
                'unsupported-type': {
                    error: 'Unsupported file type. Please upload an image.',
                    status: 415,
                },
            } as const;

            const { error, status } = messages[check.reason];
            return NextResponse.json({ error }, { status });
        }

        let buffer = Buffer.from(await file.arrayBuffer());
        let finalFilename = check.filename;
        let contentType = file.type || 'application/octet-stream';

        if (looksLikeHeic(buffer)) {
            const convertedBuffer = await convert({
                buffer: buffer as unknown as ArrayBufferLike,
                format: 'JPEG',
                quality: 0.8,
            });
            buffer = Buffer.from(convertedBuffer as ArrayBuffer);
            finalFilename = finalFilename.replace(/\.(heic|heif)$/i, '') + '.jpg';
            contentType = 'image/jpeg';
        }

        const blob = await put(`${Date.now()}_${finalFilename}`, buffer, {
            access: 'public',
            contentType,
        });

        return NextResponse.json({ success: true, url: blob.url });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
