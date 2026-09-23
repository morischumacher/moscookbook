/** Passkeys: the relying party, the device name, the challenge */
import { suite, equal } from './harness';
import { deviceName, freshChallenge, relyingParty, CHALLENGE_MS } from '../src/lib/passkeys';
import { apiAccess } from '../src/lib/accessRules';

export default function passkeyTests() {
    suite('passkeys: whose passkey it is');
    const saved = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.moscookbook.com';
    equal('the domain without www', relyingParty('https://evil.example').rpID, 'moscookbook.com');
    equal('both addresses of the site, and nothing a request claims', relyingParty('https://evil.example').origins, [
        'https://moscookbook.com',
        'https://www.moscookbook.com',
    ]);
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    equal('locally, whichever port the server is on', relyingParty('http://localhost:3055'), { rpID: 'localhost', origins: ['http://localhost:3055'] });
    equal('but only a local one', relyingParty('https://evil.example').origins, ['http://localhost:3000']);
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved;

    suite('passkeys: telling them apart');
    equal('an iPhone', deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
    equal('a Mac with Chrome', deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'Mac · Chrome');
    equal('nothing known', deviceName(null), 'Passkey');

    suite('passkeys: a challenge is spent once and soon');
    const now = 1_000_000;
    equal('fresh and for this purpose', freshChallenge({ challenge: 'c', purpose: 'login', at: now }, 'login', now + 1000), 'c');
    equal('for the other purpose', freshChallenge({ challenge: 'c', purpose: 'register', at: now }, 'login', now), null);
    equal('too old', freshChallenge({ challenge: 'c', purpose: 'login', at: now }, 'login', now + CHALLENGE_MS + 1), null);
    equal('none at all', freshChallenge(undefined, 'login', now), null);

    suite('passkeys: who may call what');
    equal('signing in needs no session', apiAccess('/api/auth/passkey-login'), 'open');
    equal('nor does asking for a challenge', apiAccess('/api/auth/passkey-options'), 'open');
    equal('adding one does', apiAccess('/api/account/passkeys'), 'session');
    equal('and so does removing one', apiAccess('/api/account/passkeys/3'), 'session');
}
