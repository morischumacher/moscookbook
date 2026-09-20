/** invitation codes and their lifecycle */
import { generateInviteCode, inviteState, inviteUrl, inviteExpiryFromNow } from '../src/lib/invite';
import { suite, check } from './harness';

export default function run() {
    suite('generateInviteCode');

    const codes = new Set<string>();
    for (let index = 0; index < 500; index++) codes.add(generateInviteCode());
    check('500 codes are all different', codes.size === 500, codes.size);

    const sample = generateInviteCode();
    check('long enough to be unguessable', sample.length >= 20, sample.length);
    check('safe in a URL without escaping', encodeURIComponent(sample) === sample, sample);

    suite('inviteState');

    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);

    check('open invitation is valid', inviteState({ id: 1, expiresAt: future, usedAt: null }) === 'valid');
    check('used invitation is used', inviteState({ id: 1, expiresAt: future, usedAt: new Date() }) === 'used');
    check('expired invitation is expired', inviteState({ id: 1, expiresAt: past, usedAt: null }) === 'expired');
    check('a used invitation stays used even after expiry',
        inviteState({ id: 1, expiresAt: past, usedAt: new Date() }) === 'used');
    check('unknown code', inviteState(null) === 'unknown');

    // The boundary matters: an invitation must not still work in the
    // millisecond it expires.
    const now = new Date('2026-01-01T12:00:00Z');
    check('expiry is exclusive',
        inviteState({ id: 1, expiresAt: new Date('2026-01-01T12:00:00Z'), usedAt: null }, now) === 'expired');
    check('one millisecond earlier is still valid',
        inviteState({ id: 1, expiresAt: new Date('2026-01-01T12:00:00.001Z'), usedAt: null }, now) === 'valid');

    suite('inviteExpiryFromNow');

    const in14 = inviteExpiryFromNow();
    const days = (in14.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    check('defaults to about 14 days', days > 13.9 && days < 14.1, days);

    suite('inviteUrl');

    check('builds a register link',
        inviteUrl('https://example.com', 'de', 'abc') === 'https://example.com/de/register?invite=abc',
        inviteUrl('https://example.com', 'de', 'abc'));
    check('tolerates a trailing slash',
        inviteUrl('https://example.com/', 'en', 'abc') === 'https://example.com/en/register?invite=abc');
    check('escapes the code',
        inviteUrl('https://example.com', 'en', 'a b&c').endsWith('invite=a%20b%26c'),
        inviteUrl('https://example.com', 'en', 'a b&c'));
}
