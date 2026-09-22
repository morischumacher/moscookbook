import { suite, equal } from './harness';
import { safeTicketPath } from '../src/lib/ticketPath';

/**
 * What may be written into a ticket's `path`.
 *
 * It arrives in a query string, so it arrives from whoever asked for the page.
 * The rule lives in one file and is applied in two — the browser and the route
 * — and this is what stops those two drifting apart, which is the failure that
 * leaves the strict one showing and the lax one storing.
 */
export default function ticketPathTests() {
    suite('safeTicketPath');

    equal('keeps a path of our own', safeTicketPath('/de/recipe/gruenes-curry'), '/de/recipe/gruenes-curry');
    equal('keeps the front page', safeTicketPath('/de'), '/de');

    equal('nothing at all is nothing', safeTicketPath(null), null);
    equal('an empty string is nothing', safeTicketPath(''), null);
    equal('a bare slash survives', safeTicketPath('/'), '/');

    /* --------------------------------------------- somewhere that is not us */

    // Each of these is a way of writing "another site" that a naive
    // startsWith('/') would wave through, and a stored value gets rendered
    // later by somebody who has forgotten where it came from.
    equal('refuses a protocol-relative URL', safeTicketPath('//evil.test/x'), null);
    equal('refuses an absolute URL', safeTicketPath('https://evil.test'), null);
    equal('refuses a backslash escape', safeTicketPath('/\\evil.test'), null);
    equal('refuses a scheme with no slashes', safeTicketPath('javascript:alert(1)'), null);
    equal('refuses a bare word', safeTicketPath('recipe/x'), null);

    /* ------------------------------------------------ the part that matters */

    /*
     * A reset link is as good as the password for the hour it lives, and it
     * carries its token in the query string. A ticket is a row an admin reads
     * later. These two facts must never meet.
     */
    equal(
        'drops a query string, token and all',
        safeTicketPath('/de/reset?token=mUZhAmCNOOl1L92Bf0OLMTTevUda3u'),
        '/de/reset'
    );
    equal('drops an ordinary query too', safeTicketPath('/de/?q=curry'), '/de/');
    equal('drops a fragment', safeTicketPath('/de/recipe/x#zutaten'), '/de/recipe/x');
    equal('drops both', safeTicketPath('/de/x?a=1#b'), '/de/x');
    equal('a path that is only a query is nothing', safeTicketPath('/?token=abc'), '/');

    /* ------------------------------------------------------------- the rest */

    equal('refuses an unreasonable length', safeTicketPath('/' + 'a'.repeat(400)), null);
}
