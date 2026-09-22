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

    /*
     * The same address, as the URL parser actually hands it over.
     *
     * `new URL('http://[::ffff:127.0.0.1]/').hostname` is `[::ffff:7f00:1]` —
     * WHATWG normalises the dotted tail into two hex groups. So the regex
     * above, which is the form a human writes and a resolver returns, never
     * matches a hostname that came out of a URL, and the loopback address
     * walks straight past a check that was written for it. Found by trying
     * it, not by reading; there was nothing in the code to suggest it.
     */
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
    if (mappedHex) {
        const high = Number.parseInt(mappedHex[1], 16);
        const low = Number.parseInt(mappedHex[2], 16);
        return isPrivateIPv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }

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

/* -------------------------------------------------------------------------- */
/*  The text of a URL                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Refuses a URL whose text already says it points inwards.
 *
 * This lived in `recipeFromHtml.ts` for a year, and five modules imported a
 * security check from a module named after recipe extraction. Worse, it had
 * grown apart from the range tables above — written earlier, never updated
 * when they were — so it missed `192.0.0/24`, `198.18/15`, everything above
 * `224`, and every IPv6 range but `::1`. The split that created this file left
 * the original body behind instead of replacing it. Now it delegates.
 *
 * Necessary and not sufficient: `https://recipes.example` passes every test
 * here and can resolve to 10.0.0.5. `safeFetch` does the resolving. This is
 * the cheap half, the one that needs no network and can refuse before a
 * socket is opened.
 */
export function isSafePublicUrl(candidate: string): boolean {
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return false;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

    const host = url.hostname.toLowerCase();
    if (host === '') return false;

    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
        return false;
    }

    // An IPv6 literal keeps its brackets in `hostname`; a bare IPv4 does not.
    // Both are handed to the range tables, which are the single source of
    // truth for what is private. The URL parser has already normalised the
    // creative spellings — `0x7f000001`, `2130706433`, `127.1` all arrive
    // here as `127.0.0.1`.
    if (host.startsWith('[')) return !isPrivateIPv6(host);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return !isPrivateIPv4(host);

    return true;
}
