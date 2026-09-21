import { suite, equal, check } from './harness';
import {
    generateCaptureToken,
    hashCaptureToken,
    captureTokenMatches,
    tokenFromHeader,
    sourceForUrl,
    firstUrlIn,
    classifyCapture,
    captureLabel,
    withoutBareUrls,
} from '../src/lib/capture';

export default function captureTests() {
    suite('capture tokens');

    const token = generateCaptureToken();
    const hash = hashCaptureToken(token);

    check('is long enough to live in plain text on a phone', token.length >= 40, token.length);
    check('is URL safe, so it survives being pasted anywhere', /^[A-Za-z0-9_-]+$/.test(token), token);
    check('two tokens differ', generateCaptureToken() !== generateCaptureToken(), true);
    check('the hash is not the token', hash !== token, true);
    check('hashing is stable', hashCaptureToken(token) === hash, true);

    check('accepts the right token', captureTokenMatches(token, hash), true);
    check('rejects a different token', !captureTokenMatches(generateCaptureToken(), hash), true);
    check('rejects an empty token', !captureTokenMatches('', hash), true);
    check(
        'rejects a malformed stored hash instead of throwing',
        !captureTokenMatches(token, 'not-hex'),
        true
    );
    check(
        'rejects a hash of the wrong length',
        !captureTokenMatches(token, hash.slice(0, 20)),
        true
    );

    suite('tokenFromHeader');

    equal('reads a Bearer header', tokenFromHeader('Bearer abc123'), 'abc123');
    equal('is case-insensitive about Bearer', tokenFromHeader('bearer abc123'), 'abc123');
    equal('accepts a bare token, because Shortcuts often sends one', tokenFromHeader('abc123'), 'abc123');
    equal('trims surrounding space', tokenFromHeader('  Bearer   abc123  '), 'abc123');
    equal('returns null when absent', tokenFromHeader(null), null);
    equal('returns null for an empty header', tokenFromHeader('   '), null);

    suite('sourceForUrl');

    equal('knows YouTube', sourceForUrl('https://www.youtube.com/watch?v=x'), 'youtube');
    equal('knows the short YouTube host', sourceForUrl('https://youtu.be/x'), 'youtube');
    equal('knows Instagram', sourceForUrl('https://www.instagram.com/p/abc/'), 'instagram');
    equal('knows TikTok', sourceForUrl('https://vm.tiktok.com/abc/'), 'tiktok');
    equal('treats anything else as a web page', sourceForUrl('https://chefkoch.de/rezepte/1'), 'web');
    equal('does not crash on a non-URL', sourceForUrl('nonsense'), 'web');

    // A host must match at a dot boundary, or "youtube.com.evil.example" would
    // be handled as YouTube.
    equal(
        'does not mistake a lookalike host for YouTube',
        sourceForUrl('https://youtube.com.evil.example/watch?v=x'),
        'web'
    );

    suite('firstUrlIn');

    equal(
        'digs the link out of shared prose',
        firstUrlIn('Schau mal: https://example.com/rezept sieht gut aus'),
        'https://example.com/rezept'
    );
    equal(
        'drops trailing sentence punctuation',
        firstUrlIn('Das hier https://example.com/rezept.'),
        'https://example.com/rezept'
    );
    equal('returns null when there is no link', firstUrlIn('nur Text'), null);
    equal(
        'takes the first of several',
        firstUrlIn('https://a.example/1 und https://b.example/2'),
        'https://a.example/1'
    );

    suite('withoutBareUrls');

    // Without this the recipe parser names the recipe after the link, because
    // it takes the first line it is given as the title.
    equal(
        'drops a line that is only a link',
        withoutBareUrls('https://www.instagram.com/p/abc/\n\nSpaghetti\n400 g Nudeln'),
        'Spaghetti\n400 g Nudeln'
    );
    equal(
        'keeps a line that has a link and something else',
        withoutBareUrls('Quelle: https://example.com/rezept'),
        'Quelle: https://example.com/rezept'
    );
    equal('collapses the gap it leaves behind', withoutBareUrls('A\n\nhttps://x.example\n\nB'), 'A\n\nB');
    equal('returns empty when there was only a link', withoutBareUrls('https://x.example'), '');

    suite('classifyCapture');

    equal(
        'an explicit URL wins',
        classifyCapture({ url: 'https://youtu.be/x', text: 'irgendein Text' }),
        {
            kind: 'url',
            source: 'youtube',
            sourceUrl: 'https://youtu.be/x',
            rawText: 'irgendein Text',
            note: null,
        }
    );

    // This is the Instagram case: a link plus the whole recipe in the caption.
    // Neither may be dropped, because the link cannot be read and the caption can.
    const instagram = classifyCapture({
        text: 'https://www.instagram.com/p/abc/\n\n400 g Spätzle\n200 g Käse',
    });
    equal('finds the link inside shared text', instagram?.sourceUrl, 'https://www.instagram.com/p/abc/');
    equal('and still keeps the caption', instagram?.kind, 'url');
    check(
        'the caption survives, because it is the only readable part',
        (instagram?.rawText ?? '').includes('400 g Spätzle'),
        instagram?.rawText
    );

    equal(
        'plain text becomes a note',
        classifyCapture({ text: 'Omas Kuchen\n200 g Mehl' })?.source,
        'note'
    );
    equal('nothing usable returns null', classifyCapture({ text: '   ', url: '' }), null);
    equal('an empty input returns null', classifyCapture({}), null);

    suite('captureLabel');

    equal(
        'prefers what the sender typed',
        captureLabel({ note: 'Für Sonntag', rawText: 'Irgendwas', sourceUrl: null }),
        'Für Sonntag'
    );
    equal(
        'otherwise takes the first line that is not a link',
        captureLabel({ note: null, rawText: 'https://x.example\nOmas Kuchen\n200 g Mehl', sourceUrl: null }),
        'Omas Kuchen'
    );
    equal(
        'falls back to a readable form of the link',
        captureLabel({ note: null, rawText: null, sourceUrl: 'https://www.instagram.com/p/abc/' }),
        'instagram.com/p/abc'
    );
    equal(
        'returns empty rather than a hardcoded German placeholder',
        captureLabel({ note: null, rawText: null, sourceUrl: null }),
        ''
    );
}
