/**
 * Errors that are not the cookbook's: thrown by a browser extension or an
 * app's built-in browser that injects its own script into every page — a
 * crypto wallet setting `window.ethereum` (work #50), a password manager, a
 * translator. Nothing here can fix them, and a row each in the reports only
 * hides the errors that are ours.
 *
 * Ours are always in our bundles (`/_next/…`); an injected script runs as
 * "global code" on the page's own address, or from an extension's.
 */
const FOREIGN_MESSAGE = /\b(ethereum|web3|metamask|solana|tronweb|phantom|__gCrWeb|__firefox__|webkit\.messageHandlers)\b/i;
const EXTENSION_FRAME = /(chrome|moz|safari-web|safari)-extension:\/\//i;

export function notOurs(message: string, stack: string | null | undefined): boolean {
    if (FOREIGN_MESSAGE.test(message)) return true;
    const frames = (stack ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (frames.some((frame) => EXTENSION_FRAME.test(frame))) return true;
    // Only frames from the page itself, none from our bundles: a script put into the page.
    const located = frames.filter((frame) => /https?:\/\//.test(frame));
    return located.length > 0 && located.every((frame) => !/\/_next\//.test(frame)) && located.every((frame) => /global code|<anonymous>|:\d+:\d+\)?$/.test(frame));
}
