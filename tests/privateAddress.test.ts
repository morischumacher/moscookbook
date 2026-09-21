import { suite, check } from './harness';
import { isPrivateIPv4, isPrivateIPv6, isPrivateAddress } from '../src/lib/privateAddress';

/**
 * Which addresses are inside.
 *
 * Every one of these ranges is unreachable from where the tests run, which is
 * exactly why they are worth a test: the only way to find out that 169.254.x
 * slipped out of the list is to check, because nothing will ever fail loudly.
 * The last one on the list is the one that matters most — it is the address a
 * cloud provider serves its instance credentials from.
 */
export default function privateAddressTests() {
    suite('addresses that are not the public internet');

    /* ------------------------------------------------------------- IPv4 */

    const inside = [
        ['127.0.0.1', 'loopback'],
        ['127.255.255.254', 'the rest of loopback'],
        ['10.0.0.5', 'private class A'],
        ['10.255.255.255', 'the end of it'],
        ['172.16.0.1', 'private class B, first'],
        ['172.31.255.254', 'private class B, last'],
        ['192.168.1.1', 'the home router'],
        ['169.254.169.254', 'the cloud metadata address'],
        ['0.0.0.0', '"this network"'],
        ['100.64.0.1', 'carrier-grade NAT'],
        ['198.18.0.1', 'benchmarking'],
        ['224.0.0.1', 'multicast'],
        ['255.255.255.255', 'broadcast'],
    ] as const;

    for (const [address, what] of inside) {
        check(`${address} is inside (${what})`, isPrivateIPv4(address));
    }

    const outside = [
        ['8.8.8.8', 'a public resolver'],
        ['1.1.1.1', 'another'],
        ['93.184.216.34', 'example.com'],
        ['172.15.255.255', 'just below the private class B block'],
        ['172.32.0.1', 'just above it'],
        ['192.167.255.255', 'just below 192.168'],
        ['192.169.0.1', 'just above it'],
        ['169.253.0.1', 'next door to link-local'],
        ['100.63.255.255', 'just below carrier-grade NAT'],
        ['100.128.0.1', 'just above it'],
        ['223.255.255.255', 'the last address before multicast'],
    ] as const;

    for (const [address, what] of outside) {
        check(`${address} is outside (${what})`, !isPrivateIPv4(address));
    }

    check('nonsense is not an address', !isPrivateIPv4('not.an.address.here'));
    check('too few parts', !isPrivateIPv4('10.0.0'));
    check('out of range', !isPrivateIPv4('10.0.0.999'));

    /* ------------------------------------------------------------- IPv6 */

    check('::1 is loopback', isPrivateIPv6('::1'));
    check('with brackets, as a URL carries it', isPrivateIPv6('[::1]'));
    check('the unspecified address', isPrivateIPv6('::'));
    check('fe80 link-local', isPrivateIPv6('fe80::1'));
    check('fc00 unique local', isPrivateIPv6('fc00::1'));
    check('fd00 unique local', isPrivateIPv6('fd12:3456::1'));

    check(
        'an IPv4 address wearing an IPv6 hat',
        isPrivateIPv6('::ffff:10.0.0.5'),
        'reaching 10.0.0.5 through a mapped address is still reaching 10.0.0.5'
    );
    check(
        'and the metadata address the same way',
        isPrivateIPv6('::ffff:169.254.169.254')
    );
    check(
        'a mapped public address is still public',
        !isPrivateIPv6('::ffff:8.8.8.8')
    );

    check('a public IPv6 address', !isPrivateIPv6('2606:4700:4700::1111'));
    check('case does not matter', isPrivateIPv6('FE80::1'));

    /* ------------------------------------------------- picking the family */

    check('told it is v4', isPrivateAddress('10.0.0.1', 4));
    check('told it is v6', isPrivateAddress('::1', 6));
    check('guessed from the shape, v4', isPrivateAddress('192.168.0.1'));
    check('guessed from the shape, v6', isPrivateAddress('fe80::abcd'));
    check('and a public one either way', !isPrivateAddress('8.8.8.8'));
}
