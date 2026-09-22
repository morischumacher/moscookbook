import { suite, equal, check } from './harness';
import {
    checkImageUpload,
    sanitizeFilename,
    extensionOf,
    looksLikeHeic,
    imageTypeOf,
    normaliseUpload,
} from '../src/lib/uploadImage';

const MB = 1024 * 1024;
const LIMIT = 10 * MB;

function file(name: string, type: string, size = 1000) {
    return { name, type, size };
}

export default async function uploadImageTests() {
    suite('checkImageUpload');

    check('accepts an ordinary photograph', checkImageUpload(file('dinner.jpg', 'image/jpeg'), LIMIT).ok);
    check('accepts a PNG', checkImageUpload(file('shot.png', 'image/png'), LIMIT).ok);

    // An iPhone sends HEIC with an empty or generic type depending on which app
    // did the sharing, so the extension has to be allowed to speak for it.
    check(
        'accepts a HEIC whose type the phone did not set',
        checkImageUpload(file('IMG_4821.HEIC', ''), LIMIT).ok
    );
    check(
        'accepts a HEIC sent as octet-stream',
        checkImageUpload(file('IMG_4821.heic', 'application/octet-stream'), LIMIT).ok
    );
    // And the other way round: a picture whose name lost its extension in a
    // share sheet is still a picture.
    check(
        'accepts an image with no extension but a real type',
        checkImageUpload(file('image', 'image/jpeg'), LIMIT).ok
    );

    equal(
        'refuses an empty file',
        checkImageUpload(file('dinner.jpg', 'image/jpeg', 0), LIMIT),
        { ok: false, reason: 'empty' }
    );
    equal(
        'refuses one over the limit',
        checkImageUpload(file('huge.jpg', 'image/jpeg', LIMIT + 1), LIMIT),
        { ok: false, reason: 'too-large' }
    );
    check('accepts one exactly at the limit', checkImageUpload(file('big.jpg', 'image/jpeg', LIMIT), LIMIT).ok);

    // Neither signal: this is the one that matters.
    equal(
        'refuses a PDF',
        checkImageUpload(file('rezept.pdf', 'application/pdf'), LIMIT),
        { ok: false, reason: 'unsupported-type' }
    );
    equal(
        'refuses a script',
        checkImageUpload(file('payload.svg', 'image/svg+xml'), LIMIT),
        { ok: false, reason: 'unsupported-type' }
    );
    equal(
        'refuses something with no type and no usable extension',
        checkImageUpload(file('notes.txt', ''), LIMIT),
        { ok: false, reason: 'unsupported-type' }
    );

    // Case is not a signal either way.
    check('is not fooled by an upper-case type', checkImageUpload(file('a.JPG', 'IMAGE/JPEG'), LIMIT).ok);

    suite('sanitizeFilename');

    equal('leaves an ordinary name alone', sanitizeFilename('dinner.jpg'), 'dinner.jpg');
    equal('replaces spaces', sanitizeFilename('mein essen.jpg'), 'mein_essen.jpg');
    equal('collapses runs of replacements', sanitizeFilename('a   b.jpg'), 'a_b.jpg');
    equal('folds characters it will not keep', sanitizeFilename('Käsespätzle.png'), 'K_sesp_tzle.png');

    // The ones that are the point: a name is about to become part of a path.
    check('strips a directory traversal', !sanitizeFilename('../../etc/passwd').includes('..'));
    check('strips slashes', !sanitizeFilename('a/b/c.jpg').includes('/'));
    check('strips backslashes', !sanitizeFilename('a\\b\\c.jpg').includes('\\'));
    check('never starts with a dot', !sanitizeFilename('...hidden.jpg').startsWith('.'));
    equal('falls back rather than returning nothing', sanitizeFilename('...'), 'upload');
    equal('falls back on an empty name', sanitizeFilename(''), 'upload');

    // Trimmed from the front: the end of a name holds the extension and the
    // part that tells two pictures apart.
    const long = sanitizeFilename('x'.repeat(300) + '.jpg');
    check('shortens a very long name', long.length <= 100, long.length);
    check('and keeps the extension while doing it', long.endsWith('.jpg'), long.slice(-10));

    suite('extensionOf');

    equal('reads an extension', extensionOf('dinner.JPG'), 'jpg');
    equal('reads the last one', extensionOf('archive.tar.gz'), 'gz');
    equal('returns nothing when there is none', extensionOf('dinner'), '');
    equal('is not confused by a dot in a folder name', extensionOf('a.b/dinner'), '');

    suite('looksLikeHeic');

    // The container signature sits a few bytes in, after the box length.
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic')]);
    check('recognises a HEIC by its signature', looksLikeHeic(heic));
    check('recognises the mif1 variant', looksLikeHeic(Buffer.from('....ftypmif1....')));

    // A name is not evidence, in either direction.
    check('is not fooled by a .heic name on a JPEG', !looksLikeHeic(Buffer.from('\xff\xd8\xff\xe0JFIF')));
    check('says no for an empty buffer', !looksLikeHeic(Buffer.alloc(0)));
    // Only the header is examined, so a JPEG that happens to contain the word
    // further in is not converted.
    check(
        'only looks at the first bytes',
        !looksLikeHeic(Buffer.concat([Buffer.alloc(200, 1), Buffer.from('ftypheic')]))
    );

    /* --------------------------------------------------- what the bytes are */

    /*
     * `checkImageUpload` trusts the name and the declared type, and that is
     * the right first gate. It was also the last one, and both of those are
     * things the uploader wrote. These are the signatures, and the file that
     * used to get through.
     */
    suite('imageTypeOf');

    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF'), Buffer.alloc(16)]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
    const avif = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.alloc(16)]);
    const heicFile = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]);

    equal('a JPEG', imageTypeOf(jpeg), 'jpeg');
    equal('a PNG', imageTypeOf(png), 'png');
    equal('a GIF', imageTypeOf(gif), 'gif');
    equal('a WebP', imageTypeOf(webp), 'webp');
    equal('an AVIF', imageTypeOf(avif), 'avif');
    equal('a HEIC', imageTypeOf(heicFile), 'heic');

    // The file that used to be stored as image/jpeg on the word of its name.
    equal('an HTML page called photo.jpg is not a picture', imageTypeOf(Buffer.from('<!doctype html><html><body>hi</body></html>')), null);
    equal('a script is not a picture', imageTypeOf(Buffer.from('#!/bin/sh\necho hello world here we go')), null);
    equal('an SVG is not admitted as a raster picture', imageTypeOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    equal('an empty buffer is nothing', imageTypeOf(Buffer.alloc(0)), null);
    equal('eleven bytes is not enough to say', imageTypeOf(Buffer.alloc(11, 0xff)), null);
    // A JPEG is three specific bytes, not one. The sabotage run shortened the
    // check to the first byte and nothing noticed.
    equal('0xFF alone is not a JPEG', imageTypeOf(Buffer.concat([Buffer.from([0xff, 0x00, 0x00]), Buffer.alloc(20)])), null);
    equal('nor is 0xFF 0xD8 without the third marker byte', imageTypeOf(Buffer.concat([Buffer.from([0xff, 0xd8, 0x00]), Buffer.alloc(20)])), null);
    equal('a RIFF that is not WebP is not a picture', imageTypeOf(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(16)])), null);

    /* ----------------------------------------------- ready to be stored */

    suite('normaliseUpload');

    const converted = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('converted')]);
    const fakeConvert = async () => converted;

    const asJpeg = await normaliseUpload('holiday.JPG', jpeg, fakeConvert);
    check('a JPEG is stored as a JPEG', asJpeg.ok && asJpeg.image.contentType === 'image/jpeg', asJpeg);
    check('with a lowercase extension that matches', asJpeg.ok && asJpeg.image.filename === 'holiday.jpg', asJpeg);
    check('and the bytes untouched', asJpeg.ok && asJpeg.image.buffer === jpeg, asJpeg);

    // The name lied. The bytes win, and the name is corrected to match.
    const lied = await normaliseUpload('photo.jpg', png, fakeConvert);
    check('a PNG called .jpg is stored as a PNG', lied.ok && lied.image.contentType === 'image/png', lied);
    check('and renamed to say so', lied.ok && lied.image.filename === 'photo.png', lied);

    const fromPhone = await normaliseUpload('IMG_0042.HEIC', heicFile, fakeConvert);
    check('a HEIC is converted', fromPhone.ok && fromPhone.image.buffer === converted, fromPhone);
    check('to a JPEG', fromPhone.ok && fromPhone.image.contentType === 'image/jpeg', fromPhone);
    check('named .jpg', fromPhone.ok && fromPhone.image.filename === 'IMG_0042.jpg', fromPhone);

    // A HEIC that arrived with no extension, which is what some apps send.
    const bare = await normaliseUpload('IMG_0042', heicFile, fakeConvert);
    check('a HEIC with no extension still gets .jpg', bare.ok && bare.image.filename === 'IMG_0042.jpg', bare);

    const refused = await normaliseUpload('photo.jpg', Buffer.from('<html>not a picture at all</html>'), fakeConvert);
    check('something that is not a picture is refused', !refused.ok && refused.reason === 'not-an-image', refused);

    // The converter is only ever asked about HEIC.
    let asked = 0;
    await normaliseUpload('a.png', png, async (b) => { asked += 1; return b; });
    equal('a PNG is not sent to the converter', asked, 0);
}
