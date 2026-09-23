/** The three pages the proxy no longer decides for */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check, equal } from './harness';
import { pathAccess, proxyStepsAside } from '../src/lib/accessRules';
import { publicOnly } from '../src/lib/collectionVisibility';
import type { CollectionRow } from '../src/lib/collectionQuery';

function page(path: string): string {
    return readFileSync(join(__dirname, '..', 'src', 'app', '[locale]', path), 'utf8');
}

/**
 * The most dangerous change in this codebase, written down.
 *
 * `pathAccess` returns `decides` for a recipe, a blog entry and a collection,
 * which means the proxy waves all three through without looking at the
 * session — and each page is then the only thing standing between a private
 * row and the open web. Forget the check on one of them and nothing fails,
 * nothing logs, and every entry is readable by anybody who guesses the slug.
 *
 * So: the rule is held here, and so is the shape of each page's guard. Source
 * reading rather than execution, for the reason tests/account.test.ts gives —
 * these pages need a database and a session. It proves the guard is written
 * and placed before the render, not that it runs.
 */
export default function publicPagesTests() {
    suite('the pages that decide for themselves');

    equal('a recipe decides', pathAccess('/de/recipe/x'), 'decides');
    equal('an entry decides', pathAccess('/de/blog/x'), 'decides');
    equal('a collection decides', pathAccess('/en/collections/x'), 'decides');
    check('and the proxy steps aside for all three', proxyStepsAside('decides'));

    /*
     * The indexes must not follow. Publishing one dish does not open the
     * cookbook; publishing one entry does not open the blog.
     */
    equal('the blog index does not', pathAccess('/de/blog'), 'account');
    equal('the collections index does not', pathAccess('/de/collections'), 'account');
    equal('the recipe list does not', pathAccess('/de'), 'account');

    suite('each page carries its own guard');

    for (const [label, file, marker] of [
        ['the recipe page', 'recipe/[slug]/page.tsx', 'recipe?.isPublic'],
        ['the entry page', 'blog/[slug]/page.tsx', 'post!.isPublic'],
        ['the collection page', 'collections/[slug]/page.tsx', 'collection?.isPublic'],
    ] as const) {
        const source = page(file);

        check(`${label} reads the row's own flag`, source.includes(marker), label);
        check(
            `${label} sends a stranger to the login instead of rendering`,
            /redirect\(`\/\$\{locale\}\/login\?next=/.test(source),
            label
        );
        /*
         * Before the render, and before `notFound()`. A missing row and a
         * private one must look the same from outside, or a word list finds
         * out what exists one guess at a time.
         */
        check(
            `${label} decides before it gives anything away`,
            source.indexOf('redirect(`/${locale}/login') < source.indexOf('notFound()'),
            label
        );
    }

    /*
     * An unpublished entry is never public whatever the column says. A draft
     * belongs to whoever is writing it, and `isPublic` on one is a switch
     * flicked ahead of time.
     */
    check(
        'an unfinished entry is not public even when the flag says so',
        page('blog/[slug]/page.tsx').includes("post!.publishedAt !== null"),
        'blog page'
    );

    suite('the sitemap invites nothing that does not open');

    /*
     * A sitemap is an invitation. Listing a private address here would hand a
     * crawler the titles of a private cookbook — which is the part worth
     * keeping to yourself — so each of the three is filtered on its own row
     * rather than on a rule somebody remembered elsewhere.
     */
    const sitemap = readFileSync(join(__dirname, '..', 'src', 'app', 'sitemap.ts'), 'utf8');

    check('recipes are filtered on public and not-a-draft',
        /where: \{ isPublic: true, isDraft: false \}/.test(sitemap), 'sitemap');
    check('entries on public and actually published',
        /where: \{ isPublic: true, publishedAt: \{ not: null \} \}/.test(sitemap), 'sitemap');
    check('collections on public',
        /prisma\.collection\.findMany\(\{[\s\S]{0,120}where: \{ isPublic: true \}/.test(sitemap), 'sitemap');
    check('and the indexes are not listed at all',
        !/\$\{site\}\/\$\{locale\}\/blog`/.test(sitemap), 'sitemap');

    suite('a public collection does not publish what is in it');

    const menu: CollectionRow = {
        id: 1,
        title: 'Sonntag',
        slug: 'sonntag',
        description: null,
        imageUrl: null,
        isPublic: true,
        shareToken: null,
        recipes: [
            { id: 1, title: 'Offen', slug: 'offen', imageUrl: null, isPublic: true },
            { id: 2, title: 'Geheim', slug: 'geheim', imageUrl: null, isPublic: false },
            { id: 3, title: 'Auch geheim', slug: 'auch', imageUrl: null, isPublic: false },
        ],
    };

    const seen = publicOnly(menu);

    equal('a stranger sees only the public ones', seen.recipes.length, 1);
    equal('and it is the right one', seen.recipes[0]?.title, 'Offen');
    check(
        'no private title survives',
        !seen.recipes.some((recipe) => recipe.title.includes('geheim')),
        seen.recipes
    );
    equal('the rest are counted rather than dropped in silence', seen.hidden, 2);

    equal(
        'a menu of nothing public shows nothing',
        publicOnly({ ...menu, recipes: menu.recipes.filter((r) => !r.isPublic) }).recipes.length,
        0
    );
    equal(
        'and one of all-public hides none',
        publicOnly({ ...menu, recipes: [menu.recipes[0]] }).hidden,
        0
    );
}
