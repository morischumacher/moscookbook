/** The account routes — the rules a person's own account is governed by */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check, equal } from './harness';
import { fullName } from '../src/lib/personName';
import { pathAccess, apiAccess } from '../src/lib/accessRules';
import { sessionStillValid, sessionUserFrom } from '../src/lib/session';

/**
 * Read from the source rather than executed.
 *
 * These four routes each need a database and a session to run, and the suite
 * has neither — so what is asserted is the shape of the guard rather than its
 * behaviour under one. That is worth doing for exactly the things that are
 * invisible when they go missing: a route that forgets to ask for the password
 * works perfectly and is wrong, and nothing downstream would notice.
 *
 * The same discipline as tests/drafts.test.ts, and the same limit: this proves
 * the call is written, not that it was awaited correctly.
 */
function source(path: string): string {
    return readFileSync(join(__dirname, '..', 'src', path), 'utf8');
}

export default function accountTests() {
    suite('account: what is asked for before a change');

    const password = source('app/api/account/password/route.ts');
    const email = source('app/api/account/email/route.ts');
    const name = source('app/api/account/name/route.ts');
    const remove = source('app/api/account/route.ts');

    for (const [label, text] of [
        ['changing the password', password],
        ['changing the address', email],
        ['deleting the account', remove],
    ] as const) {
        check(
            `${label} asks for the current password`,
            text.includes('passwordMatches('),
            label
        );
        check(
            `${label} is rate-limited per account`,
            /rateLimitShared\(`[a-z-]+:\$\{auth\.user\.id\}`/.test(text),
            label
        );
    }

    /*
     * The exception, and it is deliberate. A display name decides nothing
     * about who can get back in, so asking for a password to change it would
     * be a ceremony that teaches people to type their password into forms
     * that do not need it.
     */
    check(
        'changing your name does not, and should not',
        !name.includes('passwordMatches('),
        'name route'
    );

    check(
        'and it keeps the joined name in step with the two parts',
        name.includes('fullName(') && /data: \{ firstName, lastName, name \}/.test(name),
        'name route'
    );

    suite('account: the last admin cannot leave');

    /*
     * The one rule here with no way back. An installation with no admin has
     * no way to make one: there is no sign-up, only invitations, and inviting
     * is an admin's. Recoverable only by running create-admin against the
     * production database.
     */
    check(
        'deleting counts the other admins first',
        /admin: true, id: \{ not: auth\.user\.id \}/.test(remove),
        'delete route'
    );
    check(
        'and refuses when there are none',
        remove.includes(') === 0) return null') && remove.includes('409'),
        'delete route'
    );
    check(
        'counting and deleting in one serializable transaction, so two admins leaving at once cannot both go',
        remove.includes("isolationLevel: 'Serializable'") && /\$transaction\(/.test(remove),
        'delete route'
    );
    check(
        'and the session is destroyed with the row',
        remove.includes('session.destroy()'),
        'delete route'
    );

    /*
     * The other half of `session.destroy()`, and the half that is invisible
     * when it goes missing. The server forgets the account; the client still
     * holds a cached render of every layout above this page, all of which were
     * built for somebody signed in. Navigate without discarding it and the
     * deleted account's name is still in the header.
     *
     * Written as a source check because the alternative is a router, and a
     * router here is more mock than test. It went in when the first version —
     * a `window.location.href` assignment, chosen on the theory that only a
     * full load forgets a session — turned out to trip a lint rule and to be
     * unnecessary: sign-out has the same problem and answers it with this pair.
     */
    const settings = source('components/account/AccountSettings.tsx');

    check(
        'deleting your account throws the cached signed-in render away',
        /router\.replace\('\/login'\);\s*\n\s*router\.refresh\(\);/.test(settings),
        'AccountSettings.remove'
    );
    check(
        'and it replaces rather than pushes, so back is not the deleted account',
        !settings.includes("router.push('/login')"),
        'AccountSettings.remove'
    );

    suite('account: changing an address');

    /*
     * The move only happens when the new address answers. Until then the
     * request parks it, and the account keeps signing in with the old one.
     */
    const verify = source('app/api/auth/verify/route.ts');
    check(
        'the request only parks the new address',
        email.includes('pendingEmail: email') && !/data:\s*\{\s*email[,:\s]/.test(email),
        'email route must not write User.email'
    );
    check('the new address gets its own link', email.includes("'email', locale"), 'email route');
    check(
        'following it moves the address and confirms it',
        verify.includes('email: user.pendingEmail, emailVerifiedAt: now, pendingEmail: null'),
        'verify route'
    );
    check(
        'the old address is told once it has stopped being the address',
        verify.indexOf('emailChangedMail(user.email') > verify.indexOf('pendingEmail: null'),
        'the notice goes after the move'
    );
    check('a taken address is a 409, not a 500', email.includes('status: 409') && verify.includes('status: 409'), 'both routes');
    check('and mail failing does not fail the request', email.includes('void issueToken('), 'fire-and-forget');

    suite('account: who may reach it');

    equal('the page needs an account', pathAccess('/de/account'), 'account');
    equal('so do the routes', apiAccess('/api/account'), 'session');
    equal('every one of them', apiAccess('/api/account/password'), 'session');
    equal('including the address', apiAccess('/api/account/email'), 'session');

    suite('fullName, as the routes use it');

    equal('joins both parts', fullName({ firstName: 'Emma', lastName: 'Huber' }), 'Emma Huber');
    equal('copes with one', fullName({ firstName: 'Mo', lastName: '' }), 'Mo');
    equal('trims what it is given', fullName({ firstName: '  Mo  ', lastName: ' S ' }), 'Mo S');
}

/**
 * Sessions that can be ended.
 *
 * The cookie is stateless and was good for fourteen days whatever happened to
 * the account behind it. The version number is what makes a revocation stick.
 */
export function sessionVersionTests() {
    suite('account: a session can be ended');

    const row = { id: 7, email: 'a@b.c', name: 'Ann', admin: false, sessionVersion: 3 };
    const cookie = sessionUserFrom(row);

    equal('the version is sealed into the cookie', cookie.v, 3);
    check('a matching version is still valid', sessionStillValid(cookie, { sessionVersion: 3 }));
    check('a raised version is not', !sessionStillValid(cookie, { sessionVersion: 4 }));
    check('a deleted account is not', !sessionStillValid(cookie, null));
    check(
        'a cookie from before versions existed counts as version 0',
        sessionStillValid({ id: 7, email: 'a@b.c', name: 'Ann', admin: false }, { sessionVersion: 0 })
    );

    for (const route of ['auth/login', 'auth/register', 'auth/reset', 'account/password']) {
        check(`${route} writes the session through sessionUserFrom`, source(`app/api/${route}/route.ts`).includes('sessionUserFrom('));
    }
    check('a reset signs every other device out', /sessionVersion: \{ increment: 1 \}/.test(source('app/api/auth/reset/route.ts')));
    check('a password change signs every other device out', /sessionVersion: \{ increment: 1 \}/.test(source('app/api/account/password/route.ts')));
    check('nothing outside lib/auth reads the raw cookie for who somebody is', !/session\.user\b/.test(source('app/[locale]/recipe/[slug]/page.tsx')));
}

