import { compressImage, UPLOAD_LIMIT_BYTES } from './imageCompression';

/**
 * One picture from this device into our store, the way every form does it.
 *
 * Shrunk in the browser first — a phone photograph is several megabytes and
 * the platform refuses a request body over 4.5 MB before any of our code runs,
 * and says so in HTML, so what came back would have been "upload failed" and
 * nothing else.
 */
export type UploadResult =
    | { ok: true; url: string }
    | { ok: false; reason: 'too-large' }
    | { ok: false; reason: 'failed'; message?: string };

export async function uploadPicture(file: File, endpoint = '/api/upload'): Promise<UploadResult> {
    try {
        const prepared = await compressImage(file);
        if (prepared.size > UPLOAD_LIMIT_BYTES) return { ok: false, reason: 'too-large' };

        const formData = new FormData();
        formData.append('file', prepared);

        const res = await fetch(endpoint, { method: 'POST', body: formData });
        const data: { url?: string; message?: string } = await res.json().catch(() => ({}));

        return res.ok && data.url ? { ok: true, url: data.url } : { ok: false, reason: 'failed', message: data.message };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}
