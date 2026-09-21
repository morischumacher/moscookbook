import { suite, equal, check } from './harness';
import {
    checkImageUpload,
    sanitizeFilename,
    extensionOf,
    looksLikeHeic,
} from '../src/lib/uploadImage';

const MB = 1024 * 1024;
const LIMIT = 10 * MB;

function file(name: string, type: string, size = 1000) {
    return { name, type, size };
}

export default function uploadImageTests() {
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
}
