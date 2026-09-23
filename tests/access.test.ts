import { suite, equal, check } from './harness';
import { pathAccess, proxyStepsAside, apiAccess, isCrossSiteWrite } from '../src/lib/accessRules';
import { destinationFrom } from '../src/lib/loginDestination';
import { generateShareToken, shareUrl } from '../src/lib/shareToken';
import { sharePayload } from '../src/lib/sharePayload';

export default function accessTests() {
    suite('pathAccess');

    // The reason this file exists: the cookbook is private, and the way that
    // stops being true is a quiet one.
    equal('the front page needs an account', pathAccess('/en/'), 'account');
    equal('a bare locale needs an account', pathAccess('/de'), 'account');
    // Three paths carry the answer in the database: one recipe, one blog
    // entry, one collection. Each is open when its row says public and needs
    // an account when it does not, and only the page can tell. Everything
    // about this rule is about keeping that exception as small as it can be.
    equal('one recipe is decided by the recipe', pathAccess('/de/recipe/kaesespaetzle'), 'decides');
    equal('a trailing slash is the same page', pathAccess('/de/recipe/kaesespaetzle/'), 'decides');
    equal('and in the other locale', pathAccess('/en/recipe/plum-cake'), 'decides');
    equal('one entry is decided by the entry', pathAccess('/de/blog/kuchenabend'), 'decides');
    equal('one collection by the collection', pathAccess('/en/collections/sunday'), 'decides');

    /*
     * And the indexes are not. `/de/blog` and `/de/collections` list
     * everything the household has, which is a different thing from the one
     * entry somebody chose to publish — publishing one item must never open
     * the drawer it came out of.
     */
    equal('the blog index still needs an account', pathAccess('/de/blog'), 'account');
    equal('so does the collections index', pathAccess('/en/collections'), 'account');

    // The narrowness is the point. Anything deeper than one segment is a
    // different page that nobody has decided about, so it stays private.
    equal('a page under a recipe is not covered', pathAccess('/de/recipe/x/edit'), 'account');
    equal('nor two segments of anything', pathAccess('/de/recipe/x/photos/3'), 'account');
    equal('nor under an entry', pathAccess('/de/blog/x/edit'), 'account');
    equal('nor under a collection', pathAccess('/de/collections/x/edit'), 'account');
    equal('the recipe list itself still needs an account', pathAccess('/de/recipe'), 'account');
    equal('and so does the front page', pathAccess('/de'), 'account');

    // A slug cannot climb into the admin area or out of the recipe rule by
    // being named after something else.
    equal('a slug that looks like admin is still a recipe', pathAccess('/de/recipe/admin'), 'decides');
    equal('and /admin is still admin', pathAccess('/de/admin/recipe/x'), 'admin');
    equal('the admin area needs an admin', pathAccess('/en/admin'), 'admin');
    equal('everything under admin needs an admin', pathAccess('/de/admin/inbox'), 'admin');

    for (const open of ['login', 'register', 'forgot', 'reset', 'verify']) {
        equal(`/${open} is reachable without an account`, pathAccess(`/en/${open}`), 'open');
    }

    equal('a share link is reachable without an account', pathAccess('/de/r/abc123'), 'open');

    // The disclosure and the privacy notice exist for people who have no
    // account. Behind the sign-in form they would be decoration.
    equal('the imprint is open', pathAccess('/de/imprint'), 'open');
    equal('the privacy notice is open', pathAccess('/en/privacy'), 'open');
    equal('a page that merely starts with one is not', pathAccess('/de/imprinted'), 'account');
    equal('nor one that extends it with a hyphen', pathAccess('/de/privacy-policy'), 'account');

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

    suite('sharePayload');

    const payload = sharePayload('Thai Green Curry', 'https://www.moscookbook.com/de/r/abc');

    equal('carries the title', payload.title, 'Thai Green Curry');
    equal('carries the link', payload.url, 'https://www.moscookbook.com/de/r/abc');

    // The bug this exists for: with a `text` field as well, Telegram took the
    // text and dropped the link, so a shared recipe arrived as a paragraph of
    // prose that went nowhere. Nothing in the Web Share API promises a target
    // keeps every field, and the link is the one that has to survive.
    equal('hands over nothing but those two', Object.keys(payload).sort(), ['title', 'url']);
    check(
        'never sends a text field, whatever a target might do with it',
        !('text' in payload),
        payload
    );

    /* ------------------------------------------------ what the proxy skips */

    /*
     * `recipe` was defined as "the page decides", tested to be returned, and
     * then not listed in the proxy's own bypass — so a public recipe needed an
     * account to open at its own address. Each file agreed with itself; the
     * disagreement was between them. This holds all five values in one place.
     */
    suite('proxyStepsAside');

    check('an open page needs no session at the proxy', proxyStepsAside('open'));
    check('an unmatched path is left alone', proxyStepsAside('unmatched'));
    check('a page that decides for itself is left to it', proxyStepsAside('decides'));
    check('an account page is not', !proxyStepsAside('account'));
    check('an admin page is not', !proxyStepsAside('admin'));

    // And the path that started it, end to end through pathAccess.
    check(
        'a public recipe address reaches the page without a session',
        proxyStepsAside(pathAccess('/de/recipe/kaesespaetzle')),
        pathAccess('/de/recipe/kaesespaetzle')
    );
    check(
        'while a recipe address with a further segment still needs an account',
        !proxyStepsAside(pathAccess('/de/recipe/kaesespaetzle/edit')),
        pathAccess('/de/recipe/kaesespaetzle/edit')
    );

    /* ------------------------------------------------------------- the API */

    /*
     * The proxy never ran on /api at all until now, so every guard was
     * per-route and a route added without one was open. Now a path needs a
     * session unless it is named. The named ones are the ones that cannot
     * have a session: no account yet, a device token, a scheduler, or the
     * error reporter that runs when the session may be what broke.
     */
    suite('apiAccess');

    for (const open of [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/forgot',
        '/api/auth/reset',
        '/api/auth/verify',
        '/api/auth/logout',
        '/api/auth/resend-verification',
        '/api/capture',
        '/api/errors',
        '/api/recipes/42/view',
        '/api/cron/backup',
    ]) {
        equal(`${open} works without a session`, apiAccess(open), 'open');
    }

    for (const guarded of [
        '/api/recipes',
        '/api/recipes/42',
        '/api/recipes/42/favorite',
        '/api/recipes/42/draft',
        '/api/capture/7',
        '/api/capture/7/merge',
        '/api/capture-tokens',
        '/api/users/3/role',
        '/api/site-profiles',
        '/api/export',
        '/api/import/archive',
        '/api/ai-keys',
        // A path that merely starts like an open one.
        '/api/errors/5',
        '/api/captured',
        '/api/auth/login/extra',
        '/api/recipes/42/views',
        '/api/cron',
    ]) {
        equal(`${guarded} needs a session`, apiAccess(guarded), 'session');
    }

    /* --------------------------------------------------------- cross-site */

    suite('isCrossSiteWrite');

    const headers = (map: Record<string, string>) => ({
        get: (name: string) => map[name.toLowerCase()] ?? null,
    });

    check(
        'a same-origin POST is allowed',
        !isCrossSiteWrite('POST', headers({ origin: 'https://cookbook.example', host: 'cookbook.example' }))
    );
    check(
        'a cross-origin POST is refused',
        isCrossSiteWrite('POST', headers({ origin: 'https://evil.example', host: 'cookbook.example' }))
    );
    check(
        'the browser saying cross-site is enough on its own',
        isCrossSiteWrite('POST', headers({ 'sec-fetch-site': 'cross-site', host: 'cookbook.example' }))
    );
    check(
        'the public host behind the platform proxy is the one compared',
        !isCrossSiteWrite('POST', headers({
            origin: 'https://www.cookbook.example',
            'x-forwarded-host': 'www.cookbook.example',
            host: 'internal-1234.platform.invalid',
        }))
    );
    check(
        'case of the host does not matter',
        !isCrossSiteWrite('DELETE', headers({ origin: 'https://Cookbook.Example', host: 'cookbook.example' }))
    );

    // Non-browser clients — the iPhone shortcut, curl, the scheduler — send
    // no Origin and have no cookie jar to be tricked out of.
    check('no Origin at all is allowed', !isCrossSiteWrite('POST', headers({ host: 'cookbook.example' })));
    check('sec-fetch-site: none is allowed', !isCrossSiteWrite('POST', headers({ 'sec-fetch-site': 'none', host: 'cookbook.example' })));

    // Reads are not the concern.
    check('a cross-origin GET is not refused here', !isCrossSiteWrite('GET', headers({ origin: 'https://evil.example', host: 'cookbook.example' })));
    check('nor a HEAD', !isCrossSiteWrite('HEAD', headers({ origin: 'https://evil.example', host: 'cookbook.example' })));

    check('an Origin that is not a URL is refused', isCrossSiteWrite('POST', headers({ origin: 'null', host: 'cookbook.example' })));
    check('a request with no Host header is refused', isCrossSiteWrite('POST', headers({ origin: 'https://cookbook.example' })));
}
