/**
 * A page title with the site's name taken off the end.
 *
 * `<title>Pasta Calabrese mit Hack und Pilzen - Kochblog</title>` is the
 * overwhelmingly common shape, and the whole string was going into the recipe
 * — so a cookbook filled from pages without structured data ends up holding
 * "Zwiebelkuchen | Essen und Trinken", "Tokoroten - Just One Cookbook",
 * "Fried Chicken Sandwich — Joshua Weissman". The suffix is on the tile, in
 * the search index, in the page heading and on the printout.
 *
 * It survived this long because it is invisible in a test: a hand-written
 * fixture has the title somebody meant to test, not the title a CMS emits. It
 * turned up the first time a real page went through the recorded-import
 * harness, which is the entire argument for that harness.
 *
 * ## Why this is not a regex over " - "
 *
 * Because recipes contain dashes. "Chili sin Carne – vegan und scharf" is a
 * title, not a title and a site. Cutting on the separator alone would quietly
 * rename a quarter of the cookbook.
 *
 * So the suffix is only removed when it is **known to be the site**: it
 * matches `og:site_name`, or it matches the domain the page came from. Both
 * are facts about the page rather than guesses about the sentence. Where
 * neither is available, the title is left exactly as it was — a suffix nobody
 * removed is a cosmetic problem, and a recipe renamed by a heuristic is a lost
 * recipe.
 */

/** The separators a CMS puts between a page and its site. */
const SEPARATORS = ['|', '·', '•', '—', '–', '-', '::', '»', '«'];

/**
 * "Just One Cookbook" and "justonecookbook.com" are the same name.
 *
 * Compared with everything but letters and digits removed, so a site whose
 * `og:site_name` is spaced, hyphenated or capitalised differently from its own
 * domain still matches itself.
 */
function squash(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** The candidate names for the site a page belongs to. */
function siteNames(siteName: string, sourceUrl: string): string[] {
    const names: string[] = [];

    if (siteName.trim()) names.push(siteName.trim());

    try {
        const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
        names.push(host);
        // "justonecookbook.com" → "justonecookbook": a title says the name,
        // not the address.
        const withoutTld = host.replace(/\.[a-z.]{2,8}$/i, '');
        if (withoutTld) names.push(withoutTld);
    } catch {
        // Not a URL. Nothing to compare against, which is handled above.
    }

    return names;
}

/**
 * Strips a trailing site name, and only that.
 *
 * Returns the title unchanged whenever it is not certain — which is most of
 * the time, and is the intended behaviour.
 */
export function withoutSiteName(title: string, siteName: string, sourceUrl: string): string {
    const text = title.trim();
    if (text === '') return text;

    const names = siteNames(siteName, sourceUrl).map(squash).filter((name) => name.length >= 3);
    if (names.length === 0) return text;

    for (const separator of SEPARATORS) {
        // The *last* separator, because a title may contain one of its own:
        // "Chili sin Carne – vegan – Kochblog" keeps its middle dash.
        const at = text.lastIndexOf(` ${separator} `);
        if (at <= 0) continue;

        const head = text.slice(0, at).trim();
        const tail = text.slice(at + separator.length + 2).trim();

        if (head === '' || tail === '') continue;

        // A name that eats the whole title is not a suffix. "Kochblog" as a
        // recipe called "Kochblog" stays.
        if (head.length < 3) continue;

        if (names.includes(squash(tail))) return head;
    }

    return text;
}
