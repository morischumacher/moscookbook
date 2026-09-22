import { suite, equal } from './harness';
import { withoutPlatformWrapper, withoutSiteName } from '../src/lib/pageTitle';

/**
 * Taking the site's name off a page title.
 *
 * Two failures are possible and only one of them is acceptable. Leaving a
 * suffix on is cosmetic: "Tokoroten - Just One Cookbook" on a tile is untidy.
 * Cutting a title that was not a suffix renames somebody's recipe, in a
 * cookbook whose entire value is holding what they meant — "Chili sin Carne –
 * vegan und scharf" becoming "Chili sin Carne" is a silent edit nobody asked
 * for.
 *
 * So the cases below lean hard on what must *not* be cut.
 */
export default function pageTitleTests() {
    suite('pageTitle: the suffix comes off');

    equal(
        'a dash and the site name',
        withoutSiteName('Pasta Calabrese mit Hack - Kochblog', 'Kochblog', 'https://kochblog.de/x'),
        'Pasta Calabrese mit Hack'
    );

    equal(
        'a pipe',
        withoutSiteName('Zwiebelkuchen | Essen und Trinken', 'Essen und Trinken', 'https://essen-und-trinken.de/x'),
        'Zwiebelkuchen'
    );

    equal(
        'an em dash',
        withoutSiteName('Fried Chicken — Joshua Weissman', 'Joshua Weissman', 'https://joshuaweissman.com/r'),
        'Fried Chicken'
    );

    // No og:site_name at all: the domain is the other source of truth.
    equal(
        'the domain, when the site does not name itself',
        withoutSiteName('Tokoroten - Just One Cookbook', '', 'https://www.justonecookbook.com/tokoroten/'),
        'Tokoroten'
    );

    equal(
        'the domain with its tld',
        withoutSiteName('Linsensuppe | chefkoch.de', '', 'https://www.chefkoch.de/rezepte/1'),
        'Linsensuppe'
    );

    // Spacing and capitalisation differ between a site's name and its domain
    // constantly; both should still match.
    equal(
        'punctuation and case do not matter',
        withoutSiteName('Tokoroten · JUST-ONE-COOKBOOK', '', 'https://justonecookbook.com/t'),
        'Tokoroten'
    );

    suite('pageTitle: and everything else stays');

    equal(
        'a dash that belongs to the dish',
        withoutSiteName('Chili sin Carne – vegan und scharf', 'Kochblog', 'https://kochblog.de/x'),
        'Chili sin Carne – vegan und scharf'
    );

    equal(
        'a suffix that is not the site',
        withoutSiteName('Pasta Calabrese - schnell gemacht', 'Kochblog', 'https://kochblog.de/x'),
        'Pasta Calabrese - schnell gemacht'
    );

    // The middle dash survives; only the last one, and only if it is the site.
    equal(
        'only the last separator is considered',
        withoutSiteName('Chili sin Carne – vegan – Kochblog', 'Kochblog', 'https://kochblog.de/x'),
        'Chili sin Carne – vegan'
    );

    equal(
        'a title with no separator',
        withoutSiteName('Pasta Calabrese', 'Kochblog', 'https://kochblog.de/x'),
        'Pasta Calabrese'
    );

    equal(
        'a title that is only the site name',
        withoutSiteName('Kochblog', 'Kochblog', 'https://kochblog.de/x'),
        'Kochblog'
    );

    equal(
        'a dish whose own name ends in the site name is not gutted',
        withoutSiteName('Kochblog', '', 'https://kochblog.de/x'),
        'Kochblog'
    );

    // Nothing to compare against: leave it alone rather than guess.
    equal(
        'no site name and no usable url',
        withoutSiteName('Pasta Calabrese - Kochblog', '', 'not-a-url'),
        'Pasta Calabrese - Kochblog'
    );

    equal(
        'a very short site name is not used as a pattern',
        withoutSiteName('Pasta Calabrese - de', 'de', 'https://x.de/1'),
        'Pasta Calabrese - de'
    );

    equal(
        'a hyphen with no spaces is part of a word',
        withoutSiteName('Low-Carb Pasta', 'Pasta', 'https://pasta.de/1'),
        'Low-Carb Pasta'
    );

    equal('an empty title stays empty', withoutSiteName('', 'Kochblog', 'https://kochblog.de/x'), '');

    equal(
        'whitespace is trimmed but nothing else',
        withoutSiteName('  Pasta Calabrese  ', 'Kochblog', 'https://kochblog.de/x'),
        'Pasta Calabrese'
    );

    suite('pageTitle: the platform wrapper');

    /*
     * Three real captures, all from his inbox, all filed under the whole
     * construction as the recipe's name:
     *
     *   Ben Slater auf Instagram: "Perfect lasagne. Recipe in my newsletter."
     *
     * `withoutSiteName` cannot see it — the platform's name is in the middle,
     * not at the end.
     */
    equal(
        'the author and the platform come off',
        withoutPlatformWrapper('Ben Slater auf Instagram: "Perfect lasagne. Recipe in my newsletter."'),
        'Perfect lasagne. Recipe in my newsletter.'
    );

    equal(
        'in English too',
        withoutPlatformWrapper('Maxime on Instagram: "Porchetta & Polenta"'),
        'Porchetta & Polenta'
    );

    equal(
        'and on TikTok',
        withoutPlatformWrapper('jemand on TikTok: "Chili Öl"'),
        'Chili Öl'
    );

    // Instagram emits typographic quotes, and a caption runs over lines.
    equal(
        'curly quotes and newlines',
        withoutPlatformWrapper('Maxime Saccomanno auf Instagram: \u201cPORCHETTA\n\nIngrédients : Persil\u201d'),
        'PORCHETTA\n\nIngrédients : Persil'
    );

    // What must not be touched.
    equal(
        'a dish that merely mentions a platform',
        withoutPlatformWrapper('Der Kuchen von Instagram'),
        'Der Kuchen von Instagram'
    );

    equal(
        'an ordinary title',
        withoutPlatformWrapper('Ofengemüse mit Feta'),
        'Ofengemüse mit Feta'
    );

    equal(
        'a quotation that is not a platform line',
        withoutPlatformWrapper('Omas Rezept: "das beste Gulasch"'),
        'Omas Rezept: "das beste Gulasch"'
    );

    // It runs inside withoutSiteName, so a page that has both is handled once.
    equal(
        'both wrappers at once',
        withoutSiteName(
            'Ben Slater auf Instagram: "Perfect lasagne - Kochblog"',
            'Kochblog',
            'https://kochblog.de/x'
        ),
        'Perfect lasagne'
    );
}
