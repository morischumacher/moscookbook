/** The account routes — the rules a person's own account is governed by */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check, equal } from './harness';
import { fullName } from '../src/lib/personName';
import { pathAccess, apiAccess } from '../src/lib/accessRules';

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
        remove.includes('otherAdmins === 0') && remove.includes('409'),
        'delete route'
    );
    check(
        'and the session is destroyed with the row',
        remove.includes('session.destroy()'),
        'delete route'
    );

    suite('account: changing an address');

    /*
     * The call site, not the import. The first draft of this compared
     * `indexOf('emailChangedMail')` — which finds the import line at the top
     * of the file and is therefore before everything, whatever the code does.
     * The probe that moved the call after the update left this green, which
     * is how the check got fixed.
     */
    check(
        'the old address is told before it stops being the address',
        email.indexOf('sendMail(emailChangedMail') < email.indexOf('prisma.user.update'),
        'the notice must be sent before the update'
    );
    check(
        'the new one has to be confirmed',
        email.includes('emailVerifiedAt: null') && email.includes("'verify'"),
        'email route'
    );
    check(
        'a taken address is a 409, not a 500',
        email.includes('describeWriteFailure') && email.includes('status: 409'),
        'email route'
    );
    check(
        'and mail failing does not fail the change',
        email.includes('void sendMail(') && email.includes('void issueToken('),
        'both sends are fire-and-forget'
    );

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
