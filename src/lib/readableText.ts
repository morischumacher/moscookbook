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
 * The largest `<article>` or `<main>` on the page.
 *
 * The first version took the *first* match with a non-greedy body, which is
 * two bugs in one line and they compound.
 *
 * A page whose sections are each an `<article>` — Squarespace does this, one
 * per recipe component — has many of them. Non-greedy matching pairs the first
 * opening tag with the first *closing* tag, so on nested or repeated
 * containers it returns whatever happens to sit before the first `</article>`.
 * On a real fried-chicken recipe that was the ingredient list and nothing
 * else: forty-seven ingredients captured, thirteen method steps dropped, and
 * the model dutifully returned a recipe with no method because it was never
 * shown one. Eighty-one kilobytes of page reduced to 1478 characters, which is
 * the number that should have looked wrong.
 *
 * Every match is now considered and the longest wins. Still a heuristic, but
 * one whose failure is "too much page" rather than "half the recipe".
 */
function narrow(html: string): string {
    let best = '';

    for (const tag of ['article', 'main']) {
        for (const match of html.matchAll(
            new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)</${tag}>`, 'gi')
        )) {
            if (match[1].length > best.length) best = match[1];
        }
    }

    // A container with almost nothing in it is a layout element, not the
    // article; falling through to the body is better than a heading on its own.
    return best.length > 500 ? best : html;
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

/**
 * Everything the importer never reads, removed.
 *
 * Split out from `readableText` so the same work can be done twice: once on
 * the narrowed container and once on the whole page, which is how narrowing
 * can be checked rather than trusted.
 */
/**
 * Exported for `siteProfile`, whose CSS-selector strategy needs a page with
 * the scripts and styles already gone — `node-html-parser` counts their
 * contents as text, so a selector over the raw page can return a stylesheet.
 * Sharing this rather than writing a second version keeps the dangling-tag
 * sweep in one tested place.
 */
export function withoutNoise(html: string): string {
    let text = html;

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

    return text;
}

function strip(html: string): string {
    let text = withoutNoise(html);

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
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * How much of the page the narrowed container has to account for.
 *
 * Narrowing is a guess about markup, and the fried-chicken page is the proof
 * that a guess about markup can throw away the half of the recipe that matters.
 * So the guess is now checked against the thing it claims to improve on: strip
 * the chosen container, strip the whole page, and if the container holds less
 * than half the page's words, disbelieve it and send the page.
 *
 * Half is deliberately generous. A container that drops a cookie banner, a
 * related-posts rail and four hundred comments is doing its job and clears this
 * easily; a container that drops the method does not. The cost of being wrong
 * in this direction is a few thousand extra characters, bounded by
 * `MAX_READABLE`. The cost of being wrong in the other direction is a recipe
 * with no method, which is what this replaces.
 */
const KEEP_AT_LEAST = 0.5;

export function readableText(html: string): string {
    const whole = strip(html);
    const narrowed = strip(narrow(html));

    const chosen = narrowed.length >= whole.length * KEEP_AT_LEAST ? narrowed : whole;

    return chosen.slice(0, MAX_READABLE);
}

/* ------------------------------------------------------------------------ */
/*  The same page, with its shape kept                                       */
/* ------------------------------------------------------------------------ */

/**
 * A page as an ordered list of headings, list items and paragraphs.
 *
 * `readableText` throws the shape away on purpose — a model reads prose and
 * does not need to be told which line was an `<li>`. Learned site profiles do
 * need it, and for the opposite reason: a profile says "the ingredients are
 * the list under the heading *Ingredients*", and answering that requires
 * knowing which lines were a heading and which were list items.
 *
 * This is deliberately not a DOM. It is the same stripper with the structural
 * tags kept as labels instead of collapsed into newlines, which means the
 * noise removal, the entity table and the dangling-tag sweep are the ones
 * already under test rather than a second implementation of them.
 */
export type Block =
    | { kind: 'heading'; level: number; text: string }
    | { kind: 'item'; text: string }
    | { kind: 'text'; text: string };

/** Tags that start a new block, and what kind of block they start. */
const STRUCTURE = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi;

/** Tags that never have children and so never open a block. */
const VOID = new Set([
    'br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base',
    'col', 'embed', 'param', 'track', 'wbr',
]);

/** Tags that end whatever was being collected. */
const BOUNDARY = new Set([
    'p', 'div', 'li', 'ul', 'ol', 'section', 'article', 'header', 'main',
    'table', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'blockquote', 'br', 'figure',
    'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

/**
 * How deep the stack may go before it is treated as broken markup.
 *
 * A page with thousands of unclosed `<div>`s is not unusual, and an unbounded
 * stack on a hostile page is a way to spend memory on nothing.
 */
const MAX_DEPTH = 64;

/** A ceiling on blocks, for the same reason `MAX_READABLE` exists. */
const MAX_BLOCKS = 2_000;

/** Tidies the text collected between two structural tags. */
function inline(raw: string): string {
    return decode(raw.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The kind of block the current position sits in.
 *
 * Read from the innermost tag outwards, because `<li><p>200 g Mehl</p></li>`
 * is a list item containing a paragraph, not a paragraph. Taking the last
 * opening tag instead — which is the obvious implementation — labels half of
 * every real ingredient list as prose, and then a profile anchored on "the
 * list under this heading" finds nothing.
 */
function kindFor(stack: string[]): Block {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        const tag = stack[index];
        if (/^h[1-6]$/.test(tag)) return { kind: 'heading', level: Number(tag[1]), text: '' };
        if (tag === 'li' || tag === 'dt' || tag === 'dd' || tag === 'td' || tag === 'th') {
            return { kind: 'item', text: '' };
        }
    }
    return { kind: 'text', text: '' };
}

export function readableBlocks(html: string): Block[] {
    const source = withoutNoise(html);
    const blocks: Block[] = [];
    const stack: string[] = [];

    let at = 0;

    const flush = (upTo: number) => {
        if (blocks.length >= MAX_BLOCKS) return;
        const text = inline(source.slice(at, upTo));
        if (text === '') return;
        blocks.push({ ...kindFor(stack), text });
    };

    for (const match of source.matchAll(STRUCTURE)) {
        const [whole, closing, rawName, selfClosing] = match;
        const name = rawName.toLowerCase();
        const start = match.index ?? 0;

        if (BOUNDARY.has(name)) flush(start);

        if (closing === '/') {
            // Pop to the nearest matching tag. Markup in the wild does not
            // close everything it opens, so an unmatched close is ignored
            // rather than allowed to unwind the whole stack.
            const found = stack.lastIndexOf(name);
            if (found !== -1) stack.length = found;
        } else if (!VOID.has(name) && selfClosing !== '/' && stack.length < MAX_DEPTH) {
            stack.push(name);
        }

        at = start + whole.length;
        if (blocks.length >= MAX_BLOCKS) break;
    }

    flush(source.length);

    return blocks;
}
