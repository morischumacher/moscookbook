import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
// @ts-ignore
import convert from 'heic-convert';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file received.' }, { status: 400 });
        }

        let buffer = Buffer.from(await file.arrayBuffer());

        // Detect HEIC signature (ftypheic, ftypheix, ftyphevc, ftypmif1)
        const isHeic = buffer.includes('ftypheic') || buffer.includes('ftypheix') || buffer.includes('ftypmif1');

        let finalFilename = file.name.replaceAll(' ', '_');

        if (isHeic) {
            console.log('Detected HEIC file, converting to JPEG...');
            const convertedBuffer = await convert({
                buffer: buffer as any,
                format: 'JPEG',
                quality: 0.8
            });
            buffer = Buffer.from(convertedBuffer as ArrayBuffer);

            // Swap extension to ensure Next/Image handles it properly
            finalFilename = finalFilename.replace(/\.heic$/i, '.jpg');
        }

        const filename = Date.now() + '_' + finalFilename;

        // Ensure uploads directory exists
        const uploadDir = path.join(process.cwd(), 'public/uploads');
        try {
            await mkdir(uploadDir, { recursive: true });
        } catch (e) {
            // Ignore if exists
        }

        const filepath = path.join(uploadDir, filename);
        await writeFile(filepath, buffer);

        return NextResponse.json({
            success: true,
            url: `/uploads/${filename}`
        });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
