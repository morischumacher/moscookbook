import { suite, equal, check } from './harness';
import { postInputSchema, excerptOf } from '../src/lib/postSchema';
import { pathAccess } from '../src/lib/accessRules';
import { shareUrl } from '../src/lib/shareToken';

export default function postTests() {
    suite('postInputSchema');

    const full = postInputSchema.safeParse({
        title: '  Zwetschgen, September  ',
        body: 'Jedes Jahr dasselbe, und jedes Jahr wieder gut.',
        recipeId: 7,
        published: true,
    });

    check('accepts a complete entry', full.success, full.success ? '' : full.error.issues);
    equal('trims the title', full.success && full.data.title, 'Zwetschgen, September');
    equal('keeps the recipe it belongs to', full.success && full.data.recipeId, 7);

    // The whole point of the nullable column: writing never requires a recipe.
    const standalone = postInputSchema.safeParse({ title: 'Über Salz', body: 'Mehr, als man denkt.' });
    check('accepts an entry with no recipe at all', standalone.success);
    equal(
        'and leaves the recipe unset rather than inventing one',
        standalone.success && standalone.data.recipeId,
        undefined
    );

    const detached = postInputSchema.safeParse({ title: 'x', body: 'y', recipeId: null });
    check('accepts a recipe explicitly removed', detached.success);
    equal('as null', detached.success && detached.data.recipeId, null);

    check(
        'refuses an entry with no title',
        !postInputSchema.safeParse({ title: '   ', body: 'text' }).success
    );
    check(
        'refuses an entry with no text',
        !postInputSchema.safeParse({ title: 'Titel', body: '  ' }).success
    );

    // The address is derived but editable, and whatever is typed gets the same
    // treatment a recipe slug does — including the German transliteration.
    const slugged = postInputSchema.safeParse({
        title: 'x',
        body: 'y',
        slug: 'Zwetschgen im Spätsommer!',
    });
    equal(
        'turns a typed address into a slug',
        slugged.success && slugged.data.slug,
        'zwetschgen-im-spaetsommer'
    );
    equal(
        'leaves an empty address empty, for the server to derive',
        postInputSchema.safeParse({ title: 'x', body: 'y', slug: '  ' }).success &&
            postInputSchema.parse({ title: 'x', body: 'y', slug: '  ' }).slug,
        ''
    );

    // Same rule as a recipe image: a link, not a javascript: URL.
    check(
        'refuses a picture that is not an http link',
        !postInputSchema.safeParse({ title: 'x', body: 'y', imageUrl: 'javascript:alert(1)' }).success
    );
    equal(
        'turns an empty picture into null rather than an empty string',
        postInputSchema.parse({ title: 'x', body: 'y', imageUrl: '' }).imageUrl,
        null
    );

    // `published` is a boolean and the date is the server's: a client that
    // could send a date could publish something into next year.
    check(
        'has no field for a publication date',
        !('publishedAt' in postInputSchema.parse({ title: 'x', body: 'y' }))
    );

    suite('excerptOf');

    equal(
        'returns short text unchanged',
        excerptOf('Kurz und gut.'),
        'Kurz und gut.'
    );
    equal(
        'strips a heading marker rather than showing it',
        excerptOf('# Zwetschgen\n\nJedes Jahr wieder.'),
        'Zwetschgen Jedes Jahr wieder.'
    );
    equal(
        'keeps the words of a link and drops its address',
        excerptOf('Siehe [das Rezept](https://example.com/x) dazu.'),
        'Siehe das Rezept dazu.'
    );
    equal('drops an image entirely', excerptOf('![Blech](https://x/y.jpg) Fertig.'), 'Fertig.');
    equal('strips emphasis', excerptOf('Das ist **wichtig** und _wahr_.'), 'Das ist wichtig und wahr.');
    equal('drops a code block', excerptOf('Vorher.\n\n```\ncode\n```\n\nNachher.').trim(), 'Vorher. Nachher.');
    equal('strips a quote marker', excerptOf('> Oma sagte das.'), 'Oma sagte das.');
    equal('strips list markers', excerptOf('- eins\n- zwei'), 'eins zwei');
    equal('collapses the whitespace markdown leaves behind', excerptOf('a\n\n\n   b'), 'a b');

    const long = 'Wort '.repeat(80).trim();
    const cut = excerptOf(long, 50);

    check('shortens a long entry', cut.length <= 51, cut.length);
    check('ends with an ellipsis when something was left out', cut.endsWith('…'), cut);
    // A cut in the middle of a word reads like a typo.
    check('cuts at a word boundary', !/\w…$/.test(cut) || cut.endsWith('Wort…'), cut);
    // And the ellipsis is a claim about missing text, so it must not appear
    // when nothing is missing.
    check('adds no ellipsis when the whole text fits', !excerptOf('Genau richtig.').endsWith('…'));

    suite('post addresses');

    equal(
        'a shared entry lives under /p/',
        shareUrl('https://www.moscookbook.com', 'de', 'abc', 'post'),
        'https://www.moscookbook.com/de/p/abc'
    );
    equal(
        'a shared recipe still lives under /r/',
        shareUrl('https://www.moscookbook.com', 'de', 'abc', 'recipe'),
        'https://www.moscookbook.com/de/r/abc'
    );
    equal(
        'and a recipe is what you get when nobody says',
        shareUrl('https://x.test', 'en', 'abc'),
        'https://x.test/en/r/abc'
    );

    // The two halves have to agree, or every shared entry lands on a login form.
    equal('the proxy lets a shared entry through', pathAccess('/de/p/abc123'), 'open');
    equal(
        'and what shareUrl builds is exactly that path',
        pathAccess(new URL(shareUrl('https://x.test', 'de', 'abc123', 'post')).pathname),
        'open'
    );

    // The blog itself is not open. Reading the entries needs an account; only
    // an individual entry can be let out, and only through a token.
    equal('the blog index needs an account', pathAccess('/de/blog'), 'account');
    equal('an entry at its normal address needs an account', pathAccess('/de/blog/zwetschgen'), 'account');
    equal('writing them needs an admin', pathAccess('/de/admin/posts'), 'admin');
    // One letter apart from the open share route, and it must not be swallowed
    // by it.
    equal('"posts" is not the share route "p"', pathAccess('/en/posts'), 'account');
}
