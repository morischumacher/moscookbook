import { suite, equal, check } from './harness';
import {
    generateToken,
    hashToken,
    tokenMatches,
    expiryFor,
    tokenState,
    tokenUrl,
    TOKEN_LIFETIME_MINUTES,
} from '../src/lib/authTokens';
import { resetMail, verifyMail } from '../src/lib/authMail';
import { BRAND_MARK_CID, BRAND_MARK_PNG_BASE64 } from '../src/lib/brandMark';

export default function authTokensTests() {
    suite('generateToken');

    const token = generateToken();

    // 32 random bytes in base64url: 43 characters, and nothing that needs
    // escaping when it travels in a query string.
    check('is long enough to be unguessable', token.length >= 43, token.length);
    check('is URL-safe', /^[A-Za-z0-9_-]+$/.test(token), token);
    check('is different every time', generateToken() !== generateToken());

    suite('hashToken / tokenMatches');

    const hash = hashToken(token);

    check('produces a sha256 hex digest', /^[0-9a-f]{64}$/.test(hash), hash);
    check('is stable for the same input', hashToken(token) === hash);
    check('never stores the token itself', !hash.includes(token));

    check('accepts the token it was made from', tokenMatches(token, hash));
    check('rejects a different token', !tokenMatches(generateToken(), hash));

    // A malformed hash must be a plain "no", not a thrown exception that turns
    // into a 500 and tells the caller their input was interesting.
    check('rejects a hash that is not hex', !tokenMatches(token, 'not-a-hash'));
    check('rejects an empty hash', !tokenMatches(token, ''));
    check('rejects a hash of the wrong length', !tokenMatches(token, hash.slice(0, 40)));

    suite('expiryFor');

    const now = new Date('2026-01-01T12:00:00.000Z');

    equal(
        'a reset link dies within the hour',
        expiryFor('reset', now).toISOString(),
        '2026-01-01T13:00:00.000Z'
    );
    equal(
        'a confirmation link waits a week',
        expiryFor('verify', now).toISOString(),
        '2026-01-08T12:00:00.000Z'
    );
    check(
        'a reset link is always the shorter-lived of the two',
        TOKEN_LIFETIME_MINUTES.reset < TOKEN_LIFETIME_MINUTES.verify
    );

    suite('tokenState');

    const live = { purpose: 'reset', expiresAt: expiryFor('reset', now), usedAt: null };

    equal('accepts a fresh token', tokenState(live, 'reset', now), 'valid');
    equal('refuses a token nobody issued', tokenState(null, 'reset', now), 'unknown');
    equal(
        'refuses a token that has been redeemed',
        tokenState({ ...live, usedAt: now }, 'reset', now),
        'used'
    );
    equal(
        'refuses a token past its expiry',
        tokenState(live, 'reset', new Date('2026-01-01T13:00:01.000Z')),
        'expired'
    );
    // The boundary is closed: a token is dead at the instant it expires, not a
    // moment after. Off by one here would be a link that works forever at the
    // resolution of the clock.
    equal(
        'treats the expiry instant itself as expired',
        tokenState(live, 'reset', new Date('2026-01-01T13:00:00.000Z')),
        'expired'
    );

    // The part that matters most: a confirmation link must never be usable to
    // set a password, whatever it is posted to.
    equal(
        'refuses a confirmation token at the reset endpoint',
        tokenState({ ...live, purpose: 'verify' }, 'reset', now),
        'wrongPurpose'
    );
    equal(
        'refuses a reset token at the confirmation endpoint',
        tokenState(live, 'verify', now),
        'wrongPurpose'
    );
    // Checked before expiry and use, so that the wrong door is reported as the
    // wrong door rather than as a stale link.
    equal(
        'reports the wrong purpose even for a used token',
        tokenState({ ...live, purpose: 'verify', usedAt: now }, 'reset', now),
        'wrongPurpose'
    );

    suite('tokenUrl');

    equal(
        'builds a locale-aware link',
        tokenUrl('https://www.moscookbook.com', 'de', 'reset', 'abc'),
        'https://www.moscookbook.com/de/reset?token=abc'
    );
    equal(
        'does not double the slash when the base URL has one',
        tokenUrl('https://www.moscookbook.com/', 'en', 'verify', 'abc'),
        'https://www.moscookbook.com/en/verify?token=abc'
    );
    equal(
        'escapes a token so it survives the query string',
        tokenUrl('https://x.test', 'en', 'reset', 'a+b/c=d&e'),
        'https://x.test/en/reset?token=a%2Bb%2Fc%3Dd%26e'
    );

    // Round trip: whatever generateToken produces has to come back out of the
    // link unchanged, or every mailed link is broken for some fraction of users.
    const raw = generateToken();
    const parsed = new URL(tokenUrl('https://x.test', 'en', 'reset', raw)).searchParams.get('token');
    equal('survives being put in a link and read back out', parsed, raw);

    suite('authMail');

    for (const locale of ['en', 'de']) {
        const url = 'https://www.moscookbook.com/' + locale + '/reset?token=abc';
        const mail = resetMail('mo@example.com', 'Mo', url, locale);

        check(`${locale}: the reset link is in the plain text part`, mail.text.includes(url), mail.text);
        check(`${locale}: the reset link is in the HTML part`, mail.html?.includes(url) === true);
        check(`${locale}: the reset mail greets the person`, mail.text.includes('Mo'));
        check(`${locale}: the reset mail states how long it lasts`, /1 (hour|Stunde)/.test(mail.text), mail.text);

        const verify = verifyMail('mo@example.com', 'Mo', url, locale);
        check(`${locale}: the confirmation link is in the plain text part`, verify.text.includes(url));
        check(`${locale}: the confirmation mail states how long it lasts`, /7 (days|Tage)/.test(verify.text), verify.text);
        check(`${locale}: the two messages do not share a subject`, mail.subject !== verify.subject);
    }

    equal(
        'writes German for a German recipient',
        resetMail('a@b.c', 'Mo', 'https://x.test', 'de').subject,
        "mo'scookbook: Passwort zurücksetzen"
    );
    equal(
        'falls back to English for a locale it does not know',
        resetMail('a@b.c', 'Mo', 'https://x.test', 'fr').subject,
        "mo'scookbook: reset your password"
    );

    // A name is user input and ends up inside an HTML document.
    const hostile = resetMail('a@b.c', '<script>alert(1)</script>', 'https://x.test', 'en');
    check(
        'escapes a name that contains markup',
        hostile.html?.includes('<script>') === false,
        hostile.html
    );
    check(
        'escapes the link as an attribute value',
        resetMail('a@b.c', 'Mo', 'https://x.test/?a="b', 'en').html?.includes('"b') === false
    );

    /* ------------------------------------------------------- the wordmark */

    /*
     * The logo is attached, not linked, and the two halves of that are in
     * different files: the template writes `cid:…` and the mailer attaches
     * against the same id. If they ever disagree, every message shows a
     * broken-image icon — which is worse than no logo, and invisible from
     * either file on its own.
     */
    for (const [language, mail] of [
        ['de', resetMail('a@b.c', 'Mo', 'https://x.test', 'de')],
        ['en', resetMail('a@b.c', 'Mo', 'https://x.test', 'en')],
        ['verify', verifyMail('a@b.c', 'Mo', 'https://x.test', 'de')],
    ] as const) {
        check(
            `${language}: the wordmark is referenced by content id`,
            mail.html?.includes(`src="cid:${BRAND_MARK_CID}"`) === true,
            mail.html
        );
    }

    check(
        'and never as a remote image, which most clients would not load',
        resetMail('a@b.c', 'Mo', 'https://x.test', 'de').html?.includes('<img src="http') === false
    );

    // The text part is the real message, and it has to stand alone for a
    // client that shows no HTML at all.
    check(
        'the plain-text part carries no markup',
        resetMail('a@b.c', 'Mo', 'https://x.test', 'de').text.includes('<') === false
    );

    // The bytes are a picture, not an empty string that happens to be valid
    // base64 — the same failure the icons had.
    const mark = Buffer.from(BRAND_MARK_PNG_BASE64, 'base64');
    check('the attached mark is a PNG', mark.subarray(1, 4).toString('ascii') === 'PNG');
    check('and is large enough to be a drawing', mark.length > 2000, mark.length);
}
