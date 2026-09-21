/**
 * Whether an IP address belongs to somewhere only we can reach.
 *
 * Split out from `isSafePublicUrl`, which decides this from the *text* of a
 * URL. That is necessary and not sufficient: `https://recipes.example` passes
 * every test in it and can have an A record pointing at 10.0.0.5, and then the
 * fetch goes exactly where the check was meant to prevent. The text test
 * catches somebody typing an address; this catches somebody owning a name.
 *
 * Pure, so it can be tested without a network — which is the only way to test
 * the ranges that matter, since none of them is reachable from here anyway.
 */

/** Every range that is not the public internet. */
export function isPrivateIPv4(address: string): boolean {
    const parts = address.split('.');
    if (parts.length !== 4) return false;

    const numbers = parts.map((part) => Number(part));
    if (numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

    const [a, b] = numbers;

    if (a === 0) return true;                       // "this network"
    if (a === 10) return true;                      // private
    if (a === 127) return true;                     // loopback
    if (a === 169 && b === 254) return true;        // link-local, and the
                                                    // cloud metadata address
    if (a === 172 && b >= 16 && b <= 31) return true;   // private
    if (a === 192 && b === 168) return true;        // private
    if (a === 192 && b === 0) return true;          // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true;  // carrier-grade NAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true;                      // multicast and reserved

    return false;
}

export function isPrivateIPv6(address: string): boolean {
    // Brackets come off a URL hostname; case does not matter in an IPv6 text
    // form, and the compressed forms are what a resolver actually returns.
    const value = address.replace(/^\[|\]$/g, '').toLowerCase();

    if (value === '::1' || value === '::') return true;

    // An IPv4 address wearing an IPv6 hat: ::ffff:10.0.0.5 reaches 10.0.0.5.
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
    if (mapped) return isPrivateIPv4(mapped[1]);

    if (value.startsWith('fe80')) return true;  // link-local
    if (/^f[cd]/.test(value)) return true;      // unique local

    return false;
}

export function isPrivateAddress(address: string, family?: number): boolean {
    if (family === 4) return isPrivateIPv4(address);
    if (family === 6) return isPrivateIPv6(address);

    // No family given: decide from the shape.
    return address.includes(':') ? isPrivateIPv6(address) : isPrivateIPv4(address);
}
