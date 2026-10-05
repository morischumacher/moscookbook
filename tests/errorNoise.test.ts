/** Errors a browser extension throws are not the cookbook's (work #50) */
import { suite, check } from './harness';
import { notOurs } from '../src/lib/errorNoise';

export default function errorNoiseTests() {
    suite('error noise: not ours');
    check('a wallet setting window.ethereum', notOurs("undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')", 'global code@https://www.moscookbook.com/en/welcome:1:16'));
    check('a script injected into the page', notOurs('x is not defined', 'global code@https://www.moscookbook.com/de:1:20'));
    check('an extension frame', notOurs('boom', 'Error: boom\n    at f (chrome-extension://abc/content.js:3:9)'));
    check('ours stays', !notOurs("Cannot read properties of undefined (reading 'map')", "TypeError: Cannot read properties of undefined (reading 'map')\n    at a (https://www.moscookbook.com/_next/static/chunks/123.js:1:500)"));
    check('and one with no stack', !notOurs('Unhandled rejection: Failed to fetch', null));
}
