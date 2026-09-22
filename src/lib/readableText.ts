/**
 * A web page reduced to the words on it.
 *
 * This exists for exactly one caller: when a page has no structured data and
 * the rule-based parser comes up short, the AI is handed the page — and a
 * modern recipe page is four hundred kilobytes of which perhaps three are
 * words. Sending the markup would cost thirty times as much, and most of what
 * it bought would be a cookie banner, a navigation menu and a script that
 * renders the comments.
 *
 * It is not a readability engine and does not try to be. It throws away the
 * parts that are never the recipe, keeps the order of what is left, and stops.
 * Getting this wrong degrades an optional feature slightly; getting it clever
 * would be a second HTML parser to maintain.
 *
 * Pure and dependency-free on purpose, so it is covered by `npm test` rather
 * than by hoping.
 */

/** Tags whose contents are never prose, removed wholesale. */
const DROP = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'head', 'nav', 'footer'];

/**
 * Tags that end a line. Without these the whole page arrives as one paragraph
 * and an ingredient list becomes a sentence — which is precisely the structure
 * the recipe depends on.
 */
const BREAK = /<\/?(?:p|div|br|li|tr|h[1-6]|section|article|header|ul|ol|table|dt|dd)\b[^>]*>/gi;

/**
 * The entities that change a word, and no others.
 *
 * This started as five — the structural ones plus the numeric forms — on the
 * reasoning that an unrecognised `&hellip;` reaching the model as itself costs
 * nothing, because a model reads it as an ellipsis. True, and beside the point
 * for the pages this is aimed at: `Ofengem&uuml;se` is not a stray ellipsis, it
 * is a German word with rubble in the middle of it, and half the recipe titles
 * on a German site are written that way. A test caught it; reading would not
 * have, because the mangled form looks like text.
 *
 * So the accented Latin-1 names are here too. Not a full table — the rest
 * genuinely do degrade harmlessly — but every one that turns up inside a word
 * in German, French or Spanish.
 */
const NAMED: Record<string, string> = {
    auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
    agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', aring: 'å', aelig: 'æ',
    egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
    igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
    ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', oslash: 'ø',
    ugrave: 'ù', uacute: 'ú', ucirc: 'û',
    ccedil: 'ç', ntilde: 'ñ', yacute: 'ý',
    Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Aring: 'Å', AElig: 'Æ',
    Egrave: 'È', Eacute: 'É', Ecirc: 'Ê',
    Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Oslash: 'Ø',
    Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û',
    Ccedil: 'Ç', Ntilde: 'Ñ',
    deg: '°', frac12: '½', frac14: '¼', frac34: '¾',
    ndash: '–', mdash: '—', hellip: '…', bull: '•',
    laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', rsquo: '’',
};

function decode(text: string): string {
    return text
        .replace(/&nbsp;/gi, ' ')
        // Case-sensitive on purpose: &Uuml; and &uuml; are different letters.
        .replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (whole, name: string) =>
            Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : whole
        )
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d{1,6});/g, (_, code: string) => {
            const value = Number(code);
            return value > 0 && value < 0x110000 ? String.fromCodePoint(value) : '';
        })
        .replace(/&#x([0-9a-f]{1,6});/gi, (_, code: string) => {
            const value = Number.parseInt(code, 16);
            return value > 0 && value < 0x110000 ? String.fromCodePoint(value) : '';
        });
}

/**
 * The narrowest container that plausibly holds the article.
 *
 * `<article>` before `<main>` because a page can have one inside the other and
 * the inner one is the recipe. Neither present is the common case on a site
 * that needed this function in the first place, and then the whole body is
 * used — the drop list above is what makes that tolerable.
 */
function narrow(html: string): string {
    for (const tag of ['article', 'main']) {
        const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
        // A container with almost nothing in it is a layout element, not the
        // article; falling through to the body is better than returning a
        // heading on its own.
        if (match && match[1].length > 500) return match[1];
    }
    return html;
}

/**
 * How much is handed on.
 *
 * Twelve thousand characters is three or four times the longest recipe page
 * worth of actual words, and it is a ceiling on what one failed import can
 * cost. A recipe that needs more than this was not going to survive the
 * import anyway.
 */
export const MAX_READABLE = 12_000;

export function readableText(html: string): string {
    let text = narrow(html);

    for (const tag of DROP) {
        text = text.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), ' ');
        text = text.replace(new RegExp(`<${tag}\\b[^>]*/>`, 'gi'), ' ');
    }

    /*
     * An opening tag that is never closed.
     *
     * The rules above need a closing tag to match, so `<script>var x = 1;` at
     * the end of a truncated page left a line of JavaScript in the output — and
     * this function is handed `html.slice(0, MAX_HTML_BYTES)`, so a truncated
     * page is not a hypothetical, it is what a large page *always* looks like
     * here. A dangling script or style runs to the end of what is left.
     */
    for (const tag of ['script', 'style', 'noscript', 'template']) {
        text = text.replace(new RegExp(`<${tag}\\b[^>]*>(?![\\s\\S]*?</${tag}>)[\\s\\S]*$`, 'i'), ' ');
    }

    text = text.replace(BREAK, '\n');
    // Everything else: comments first, since a comment can contain a `>`.
    text = text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');

    text = decode(text);

    return text
        .split('\n')
        .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
        .filter((line) => line !== '')
        .join('\n')
        // Three blank lines and eighty of them read the same to a model and
        // cost differently.
        .replace(/\n{3,}/g, '\n\n')
        .slice(0, MAX_READABLE);
}
