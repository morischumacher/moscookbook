import { suite, equal, check } from './harness';
import { pathAccess } from '../src/lib/accessRules';
import { destinationFrom } from '../src/lib/loginDestination';
import { generateShareToken, shareUrl } from '../src/lib/shareToken';

export default function accessTests() {
    suite('pathAccess');

    // The reason this file exists: the cookbook is private, and the way that
    // stops being true is a quiet one.
    equal('the front page needs an account', pathAccess('/en/'), 'account');
    equal('a bare locale needs an account', pathAccess('/de'), 'account');
    equal('a recipe needs an account', pathAccess('/de/recipe/kaesespaetzle'), 'account');
    equal('the admin area needs an admin', pathAccess('/en/admin'), 'admin');
    equal('everything under admin needs an admin', pathAccess('/de/admin/inbox'), 'admin');

    for (const open of ['login', 'register', 'forgot', 'reset', 'verify']) {
        equal(`/${open} is reachable without an account`, pathAccess(`/en/${open}`), 'open');
    }

    equal('a share link is reachable without an account', pathAccess('/de/r/abc123'), 'open');

    // Both ends of every open path are anchored at a segment boundary. Without
    // that, a page whose name merely starts with one of these words would be
    // published by accident.
    equal('a page that only starts with an open name is private', pathAccess('/en/registered'), 'account');
    equal('"reset-all" is not "reset"', pathAccess('/en/reset-all'), 'account');
    equal('"recipe" is not the share route "r"', pathAccess('/en/recipe'), 'account');
    equal('"rezepte" is not the share route "r"', pathAccess('/de/rezepte'), 'account');
    // "admin" beats "open" — there is no page under /admin that should be open,
    // and if one were ever named "login" it must still be for admins only.
    equal('admin is decided before the open list', pathAccess('/en/admin/login'), 'admin');

    // Anything the proxy's matcher lets through that is not one of our pages.
    equal('a path with no locale is not ours to judge', pathAccess('/'), 'unmatched');
    equal('another language prefix is not ours to judge', pathAccess('/fr/login'), 'unmatched');
    equal('a locale as a prefix of a word does not count', pathAccess('/english/secrets'), 'unmatched');

    suite('destinationFrom');

    equal('keeps a path of our own', destinationFrom('/de/recipe/x', '/'), '/recipe/x');
    equal('strips the locale so it is not added twice', destinationFrom('/en/admin', '/'), '/admin');
    equal('turns a bare locale into the front page', destinationFrom('/de', '/'), '/');
    equal('keeps a query string', destinationFrom('/en/?q=curry', '/'), '/?q=curry');
    equal('falls back when there is nothing', destinationFrom(null, '/admin'), '/admin');
    equal('falls back on an empty string', destinationFrom('', '/'), '/');

    // An open redirect is how a phishing link is made to start on a domain the
    // victim trusts. Each of these is a way of writing "somewhere else" that a
    // naive startsWith('/') check would wave through.
    equal('refuses a protocol-relative URL', destinationFrom('//evil.test', '/'), '/');
    equal('refuses a backslash escape', destinationFrom('/\\evil.test', '/'), '/');
    equal('refuses an absolute URL', destinationFrom('https://evil.test', '/'), '/');
    equal('refuses a scheme with no slashes', destinationFrom('javascript:alert(1)', '/'), '/');

    suite('shareToken');

    const token = generateShareToken();

    check('is long enough to be unguessable', token.length >= 22, token.length);
    check('is URL-safe', /^[A-Za-z0-9_-]+$/.test(token), token);
    check('is different every time', generateShareToken() !== generateShareToken());

    // The page refuses anything that cannot be a token before it asks the
    // database, so the two definitions have to agree.
    check('matches the pattern the shared page accepts', /^[A-Za-z0-9_-]{16,64}$/.test(token), token);

    equal(
        'builds the public address',
        shareUrl('https://www.moscookbook.com', 'de', 'abc'),
        'https://www.moscookbook.com/de/r/abc'
    );
    equal(
        'does not double the slash when the base URL has one',
        shareUrl('https://www.moscookbook.com/', 'en', 'abc'),
        'https://www.moscookbook.com/en/r/abc'
    );

    // The link that gets built has to be one the proxy lets through, or every
    // share link sends its recipient to a login form.
    equal(
        'produces a path the proxy treats as open',
        pathAccess(new URL(shareUrl('https://x.test', 'de', token)).pathname),
        'open'
    );
}
