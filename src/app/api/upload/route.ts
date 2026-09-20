import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
// @ts-expect-error - heic-convert ships no type declarations
import convert from 'heic-convert';
import { requireAdmin } from '@/lib/auth';

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/heic',
    'image/heif',
]);

const ALLOWED_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'heif',
]);

function extensionOf(filename: string): string {
    const match = /\.([a-z0-9]+)$/i.exec(filename);
    return match ? match[1].toLowerCase() : '';
}

function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^[._]+/, '')
        .slice(-100) || 'upload';
}

export async function POST(request: Request) {
    // Uploads write to the project's Blob store and cost money, so this
    // endpoint is admin-only just like recipe creation.
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File) || file.size === 0) {
            return NextResponse.json({ error: 'No file received.' }, { status: 400 });
        }

        if (file.size > MAX_FILE_BYTES) {
            return NextResponse.json(
                { error: `File is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.` },
                { status: 413 }
            );
        }

        const extension = extensionOf(file.name);
        const mimeAllowed = file.type ? ALLOWED_MIME_TYPES.has(file.type.toLowerCase()) : false;
        const extensionAllowed = ALLOWED_EXTENSIONS.has(extension);

        // Phones often send HEIC with an empty or generic MIME type, so accept
        // either signal — but require at least one of them.
        if (!mimeAllowed && !extensionAllowed) {
            return NextResponse.json(
                { error: 'Unsupported file type. Please upload an image.' },
                { status: 415 }
            );
        }

        let buffer = Buffer.from(await file.arrayBuffer());
        let finalFilename = sanitizeFilename(file.name);
        let contentType = file.type || 'application/octet-stream';

        // Detect HEIC by its container signature rather than trusting the name.
        const header = buffer.subarray(0, 64);
        const isHeic =
            header.includes('ftypheic') ||
            header.includes('ftypheix') ||
            header.includes('ftyphevc') ||
            header.includes('ftypmif1');

        if (isHeic) {
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
