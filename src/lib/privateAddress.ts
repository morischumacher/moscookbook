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

    const words = ipv6Words(value);
    // Not an address we can read is not an address we will fetch.
    if (!words) return true;

    const [w0, w1, w2, w3, w4, w5, w6, w7] = words;
    const embedded = () => `${w6 >> 8}.${w6 & 0xff}.${w7 >> 8}.${w7 & 0xff}`;
    const zeroUpTo = (count: number) => words.slice(0, count).every((word) => word === 0);

    // :: and ::1.
    if (zeroUpTo(7) && w7 <= 1) return true;

    // IPv4 wearing an IPv6 hat, in every form that reaches the IPv4 address:
    // mapped (::ffff:a.b.c.d), the old "compatible" form (::a.b.c.d, which the
    // URL parser writes as [::7f00:1]), and NAT64 (64:ff9b::a.b.c.d).
    if (zeroUpTo(5) && w5 === 0xffff) return isPrivateIPv4(embedded());
    if (zeroUpTo(6)) return isPrivateIPv4(embedded());
    if (w0 === 0x64 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) {
        return isPrivateIPv4(embedded());
    }
    if (w0 === 0x64 && w1 === 0xff9b && w2 === 1) return true;  // local-use NAT64

    // 6to4 carries its IPv4 address in the second and third words.
    if (w0 === 0x2002) {
        return isPrivateIPv4(`${w1 >> 8}.${w1 & 0xff}.${w2 >> 8}.${w2 & 0xff}`);
    }

    if (w0 === 0x2001 && w1 === 0) return true;             // Teredo
    if (w0 === 0x2001 && w1 === 0xdb8) return true;         // documentation
    if ((w0 & 0xffc0) === 0xfe80) return true;              // link-local
    if ((w0 & 0xffc0) === 0xfec0) return true;              // old site-local
    if ((w0 & 0xfe00) === 0xfc00) return true;              // unique local
    if ((w0 & 0xff00) === 0xff00) return true;              // multicast

    return false;
}

/**
 * The eight 16-bit words of an IPv6 address, or null for anything that is not
 * one. Handles `::` and a dotted IPv4 tail; a zone (`%eth0`) is not an
 * address a public page can send us to, so it is refused.
 */
function ipv6Words(value: string): number[] | null {
    if (value.includes('%')) return null;

    let text = value;
    const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
    if (tail) {
        const parts = tail[1].split('.').map(Number);
        if (parts.some((n) => n > 255)) return null;
        text = `${text.slice(0, -tail[1].length)}${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
    }

    const halves = text.split('::');
    if (halves.length > 2) return null;

    const read = (half: string) => (half === '' ? [] : half.split(':'));
    const head = read(halves[0]);
    const rest = halves.length === 2 ? read(halves[1]) : [];
    const missing = 8 - head.length - rest.length;

    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

    const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
    if (!all.every((word) => /^[0-9a-f]{1,4}$/.test(word))) return null;

    return all.map((word) => Number.parseInt(word, 16));
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
