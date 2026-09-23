/** The service worker and the page agree on where offline copies live */
import { readFileSync } from 'node:fs';
import { suite, check } from './harness';
import { OFFLINE_CACHE } from '../src/lib/offlineCopies';

export default function offlineTests() {
    suite('offline: one cache, named the same on both sides');
    const worker = readFileSync('public/sw.js', 'utf8');
    const version = /const VERSION = '([^']+)'/.exec(worker)?.[1];
    check(
        'the page keeps favourites in the cache the worker reads',
        `moscookbook-${version}` === OFFLINE_CACHE,
        `sw.js has moscookbook-${version}, lib/offlineCopies has ${OFFLINE_CACHE}`
    );
    check('the worker hands the page over before storing it', /event\.waitUntil\(keep\(/.test(worker));
    check('the admin area is never kept', /admin\|/.test(worker));
}
