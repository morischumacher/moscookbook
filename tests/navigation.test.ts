import { suite, equal } from './harness';
import { withoutLocale, sectionFor, adminSectionFor } from '../src/lib/navigation';

/**
 * Which part of the site a path belongs to.
 *
 * Worth its own suite because the failure is silent: a rule that matches too
 * much lights two sections at once, one that matches too little lights none,
 * and either way nobody sees an error — they just stop knowing where they are,
 * which is the state this replaced.
 */
export default function navigationTests() {
    suite('knowing where you are');

    /* ---------------------------------------------------------- the locale */

    equal('the locale comes off the front', withoutLocale('/de/blog'), '/blog');
    equal('a bare locale is the root', withoutLocale('/en'), '/');
    equal('the root stays the root', withoutLocale('/'), '/');
    equal('a path with no locale is left alone', withoutLocale('/blog'), '/blog');

    // "/deutsch" and "/energy" begin with the letters of a locale and are not
    // one, which a naive prefix strip gets wrong.
    equal('a path that merely starts with those letters survives', withoutLocale('/deutschland'), '/deutschland');
    equal('and so does the other one', withoutLocale('/entries'), '/entries');

    /* --------------------------------------------------------- the section */

    equal('the front page is the recipes', sectionFor('/de'), 'recipes');
    equal('so is a recipe', sectionFor('/de/recipe/thai-green-curry'), 'recipes');
    equal('the blog is the blog', sectionFor('/en/blog'), 'blog');
    equal('and an entry in it', sectionFor('/en/blog/erster-eintrag'), 'blog');
    equal('the admin is the admin', sectionFor('/de/admin'), 'admin');

    equal(
        'an admin page about the blog is admin, not blog',
        sectionFor('/de/admin/posts'),
        'admin'
    );

    equal(
        'creating a recipe is admin, not recipes',
        sectionFor('/de/admin/create'),
        'admin'
    );

    // Nobody reading these has the navigation anyway, and marking a section
    // would be a claim about where they are that is not true.
    equal('logging in is nowhere', sectionFor('/de/login'), null);
    equal('a shared recipe is nowhere', sectionFor('/de/r/abc123'), null);
    equal('a shared entry is nowhere', sectionFor('/de/p/abc123'), null);
    equal('a page with no locale at all is nowhere', sectionFor('/api/recipes'), null);

    /* --------------------------------------------------- the admin's tools */

    equal('the overview is exact', adminSectionFor('/de/admin'), '/admin');
    equal(
        'creating a recipe belongs to the overview it came from',
        adminSectionFor('/de/admin/create'),
        '/admin'
    );
    equal('editing one too', adminSectionFor('/de/admin/edit/12'), '/admin');

    equal('the inbox is its own', adminSectionFor('/de/admin/inbox'), '/admin/inbox');
    equal('an entry being edited is still the entries', adminSectionFor('/de/admin/posts/4'), '/admin/posts');
    equal('a new entry as well', adminSectionFor('/de/admin/posts/new'), '/admin/posts');
    equal('the people page', adminSectionFor('/en/admin/users'), '/admin/users');
    equal('the errors', adminSectionFor('/en/admin/errors'), '/admin/errors');

    equal('outside the admin, nothing', adminSectionFor('/de/blog'), null);
}
