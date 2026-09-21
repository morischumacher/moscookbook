import { suite, equal, check } from './harness';
import { ownBlobUrls } from '../src/lib/blobCleanup';

const OURS = 'https://abc123.public.blob.vercel-storage.com/dinner-x1.jpg';

export default function blobCleanupTests() {
    suite('ownBlobUrls');

    equal('keeps a file in our own store', ownBlobUrls([OURS]), [OURS]);

    // The rule that matters. A recipe imported from a website holds a link to
    // somebody else's server, and asking the Blob API to delete that is at best
    // a wasted call and at worst a request we had no business making.
    equal('refuses a foreign host', ownBlobUrls(['https://kochblog.example/bilder/kuchen.jpg']), []);
    equal(
        'refuses a host that merely ends in something similar',
        ownBlobUrls(['https://evil.example/public.blob.vercel-storage.com/x.jpg']),
        []
    );
    equal(
        'refuses a look-alike domain',
        ownBlobUrls(['https://public.blob.vercel-storage.com.evil.test/x.jpg']),
        []
    );
    equal('refuses plain http', ownBlobUrls(['http://abc.public.blob.vercel-storage.com/x.jpg']), []);

    equal('drops nulls and blanks', ownBlobUrls([null, undefined, '']), []);
    equal('drops something that is not a URL at all', ownBlobUrls(['not a url']), []);

    // Deleting the same file twice is a second request for nothing.
    equal('deduplicates', ownBlobUrls([OURS, OURS]), [OURS]);

    const mixed = ownBlobUrls([OURS, 'https://kochblog.example/x.jpg', null]);
    check('keeps ours out of a mixed list and nothing else', mixed.length === 1 && mixed[0] === OURS, mixed);
}
