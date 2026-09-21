import { suite, check, equal } from './harness';
import {
    fittedSize,
    worthCompressing,
    looksLikeImage,
    isProbablyHeic,
    UPLOAD_LIMIT_BYTES,
    MAX_DIMENSION,
} from '../src/lib/imageCompression';

/**
 * The decisions taken before a picture is uploaded.
 *
 * `compressImage` itself needs a canvas and cannot be run here, so what is
 * tested is everything it decides *with*: which files are offered to it, which
 * ones it bothers to re-encode, and what size it aims for. All three had a bug
 * that only appeared on a phone, and all three are one-line rules — exactly the
 * kind that gets rewritten by somebody who does not own an iPhone.
 */
export default function imageCompressionTests() {
    suite('preparing an upload');

    /* ---------------------------------------------------------- the limit */

    check(
        'the limit stays under what the platform will carry',
        UPLOAD_LIMIT_BYTES < 4.5 * 1024 * 1024,
        UPLOAD_LIMIT_BYTES
    );

    check('and leaves room for a real photograph', UPLOAD_LIMIT_BYTES >= 2 * 1024 * 1024);

    /* ------------------------------------------------------- fitting size */

    equal('a picture smaller than the cap is left as it is', fittedSize(800, 600, 2000), {
        width: 800,
        height: 600,
    });

    equal('a landscape photograph is fitted by its width', fittedSize(4032, 3024, 2000), {
        width: 2000,
        height: 1500,
    });

    equal('a portrait photograph is fitted by its height', fittedSize(3024, 4032, 2000), {
        width: 1500,
        height: 2000,
    });

    // A canvas of zero height throws; a panorama is the shape that gets there.
    const panorama = fittedSize(8000, 3, 2000);
    check('an extreme panorama keeps at least one pixel of height', panorama.height >= 1, panorama);

    equal('nothing is enlarged', fittedSize(100, 50, 2000), { width: 100, height: 50 });

    equal('a picture of no size does not divide by zero', fittedSize(0, 0, 2000), {
        width: 0,
        height: 0,
    });

    /* --------------------------------------------------- what is an image */

    check(
        'a HEIC with no MIME type at all is still an image',
        looksLikeImage({ type: '', name: 'IMG_4021.HEIC' }),
        'this is what an iPhone hands over, and the old filter dropped it'
    );

    check('a JPEG is an image', looksLikeImage({ type: 'image/jpeg', name: 'x.jpg' }));
    check(
        'an image with a type but an odd name is an image',
        looksLikeImage({ type: 'image/png', name: 'screenshot' })
    );
    check('a PDF is not', !looksLikeImage({ type: 'application/pdf', name: 'recipe.pdf' }));
    check('a video is not', !looksLikeImage({ type: 'video/mp4', name: 'clip.mp4' }));

    /* ------------------------------------------------ what is re-encoded */

    check(
        'a small HEIC is converted anyway',
        worthCompressing({ size: 200_000, type: 'image/heic', name: 'a.heic' }),
        'the point of converting HEIC is the format, not the size'
    );

    check(
        'a HEIC recognised only by its name is converted too',
        worthCompressing({ size: 200_000, type: '', name: 'IMG_1.heic' })
    );

    check(
        'a big JPEG is re-encoded',
        worthCompressing({ size: 5_000_000, type: 'image/jpeg', name: 'a.jpg' })
    );

    check(
        'a small PNG is left alone, so it keeps its transparency',
        !worthCompressing({ size: 40_000, type: 'image/png', name: 'logo.png' })
    );

    check(
        'an animated GIF is never redrawn',
        !worthCompressing({ size: 9_000_000, type: 'image/gif', name: 'a.gif' }),
        'a canvas would keep one frame of it'
    );

    check('an empty file is not worth anything', !worthCompressing({ size: 0, type: 'image/jpeg', name: 'a.jpg' }));

    /* ------------------------------------------------------------- HEIC */

    check('HEIC by type', isProbablyHeic({ type: 'image/heic', name: 'a' }));
    check('HEIF by type', isProbablyHeic({ type: 'image/heif', name: 'a' }));
    check('HEIC by extension, upper case', isProbablyHeic({ type: '', name: 'IMG_9.HEIC' }));
    check('a JPEG is not HEIC', !isProbablyHeic({ type: 'image/jpeg', name: 'a.jpg' }));
    check(
        'a file merely called heic-something is not HEIC',
        !isProbablyHeic({ type: 'image/jpeg', name: 'heic-converter-output.jpg' })
    );

    /* --------------------------------------------------------- the target */

    check(
        'the target size is at least twice what a page displays',
        MAX_DIMENSION >= 1600,
        MAX_DIMENSION
    );
}
