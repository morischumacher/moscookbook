import { suite, check, equal } from './harness';
import { safeFetch, UnsafeUrlError } from '../src/lib/safeFetch';

/**
 * Following a redirect without following it inwards.
 *
 * This is the test that matters most in the file, because the bug it guards
 * against is invisible: everything worked, the import succeeded, and a page
 * that answered `302 → 169.254.169.254` had its metadata read out into a draft
 * an admin then opened. Nothing anywhere said so.
 *
 * fetch is replaced with a scripted one rather than a network being used: what
 * is being tested is which addresses get asked, not what any of them returns.
 */

interface Hop {
    status: number;
    location?: string;
    body?: string;
}

/** A fetch that answers from a script and records everything it was asked. */
function scripted(script: Record<string, Hop>) {
    const asked: string[] = [];
    const original = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        asked.push(url);

        const hop = script[url];
        if (!hop) throw new Error(`nothing scripted for ${url}`);

        const headers = new Headers();
        if (hop.location) headers.set('location', hop.location);

        return new Response(hop.body ?? '', { status: hop.status, headers });
    }) as typeof fetch;

    return { asked, restore: () => { globalThis.fetch = original; } };
}

export default async function safeFetchTests() {
    suite('following redirects safely');

    /* ---------------------------------------------- the ordinary good case */

    {
        const net = scripted({ 'https://example.test/r': { status: 200, body: 'hello' } });
        const response = await safeFetch('https://example.test/r');

        equal('a page that is just there comes back', response.status, 200);
        equal('and was asked for exactly once', net.asked, ['https://example.test/r']);
        net.restore();
    }

    {
        const net = scripted({
            'https://example.test/a': { status: 301, location: 'https://example.test/b' },
            'https://example.test/b': { status: 200, body: 'moved' },
        });

        const response = await safeFetch('https://example.test/a');
        equal('a redirect to a public address is followed', response.status, 200);
        equal('both hops were asked for', net.asked.length, 2);
        net.restore();
    }

    {
        const net = scripted({
            'https://example.test/a': { status: 302, location: '/b' },
            'https://example.test/b': { status: 200 },
        });

        await safeFetch('https://example.test/a');
        equal(
            'a relative Location is resolved against where we asked',
            net.asked[1],
            'https://example.test/b'
        );
        net.restore();
    }

    /* ------------------------------------------------ what must not happen */

    {
        // The exact shape of the attack: a public host that sends you inwards.
        const net = scripted({
            'https://example.test/a': {
                status: 302,
                location: 'http://169.254.169.254/latest/meta-data/',
            },
        });

        let refused = false;
        try {
            await safeFetch('https://example.test/a');
        } catch (error) {
            refused = error instanceof UnsafeUrlError;
        }

        check('a redirect to the metadata address is refused', refused);
        check(
            'and it was never asked for',
            !net.asked.includes('http://169.254.169.254/latest/meta-data/'),
            net.asked
        );
        net.restore();
    }

    for (const inward of [
        'http://127.0.0.1/admin',
        'http://localhost:5432/',
        'http://10.0.0.5/secret',
        'http://192.168.1.1/',
        'http://172.16.0.9/',
        'file:///etc/passwd',
        /*
         * The IPv6 spellings. Every one of these was fetched until today:
         * `isSafePublicUrl` knew only `::1`, and `resolvesPublicly` waved
         * through anything with a colon on the assumption that the text check
         * had done the work. Two guards each trusting the other is no guard.
         * The `::ffff:7f00:1` form is what the URL parser makes of
         * `::ffff:127.0.0.1`, and it is the one the old dotted regex could
         * never have matched.
         */
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:7f00:1]/',
        'http://[::ffff:169.254.169.254]/latest/meta-data/',
        'http://[fd00::1]/',
        'http://[fe80::1]/',
        'http://[::1]:5432/',
        // And the numeric disguises the parser normalises before we see them.
        'http://2130706433/',
        'http://0x7f000001/',
        'http://127.1/',
    ]) {
        const net = scripted({ 'https://example.test/a': { status: 302, location: inward } });

        let refused = false;
        try {
            await safeFetch('https://example.test/a');
        } catch (error) {
            refused = error instanceof UnsafeUrlError;
        }

        check(`a redirect to ${inward} is refused`, refused);
        check(`and ${inward} was never asked for`, !net.asked.includes(inward));
        net.restore();
    }

    {
        // A chain that only turns inward on the third hop — the case a check
        // on the first address alone cannot catch.
        const net = scripted({
            'https://example.test/1': { status: 302, location: 'https://example.test/2' },
            'https://example.test/2': { status: 302, location: 'http://10.1.2.3/' },
        });

        let refused = false;
        try {
            await safeFetch('https://example.test/1');
        } catch (error) {
            refused = error instanceof UnsafeUrlError;
        }

        check('a chain that turns inward later is still refused', refused);
        check('and the private address was never asked for', !net.asked.includes('http://10.1.2.3/'));
        net.restore();
    }

    {
        // A loop, which without a limit is a request that never returns.
        const net = scripted({
            'https://example.test/loop': { status: 302, location: 'https://example.test/loop' },
        });

        let stopped = false;
        try {
            await safeFetch('https://example.test/loop');
        } catch (error) {
            stopped = error instanceof UnsafeUrlError;
        }

        check('a redirect loop stops', stopped);
        check('after a bounded number of hops', net.asked.length <= 6, net.asked.length);
        net.restore();
    }

    {
        const net = scripted({
            'https://example.test/a': { status: 302 },
        });

        const response = await safeFetch('https://example.test/a');
        equal(
            'a redirect with no Location is handed back rather than guessed at',
            response.status,
            302
        );
        net.restore();
    }
}
