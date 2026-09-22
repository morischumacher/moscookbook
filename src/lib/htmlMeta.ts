/**
 * The small things every reader of a web page needs, in one place.
 *
 * Three modules each carried their own copy of the `<meta>` tag regex — two
 * of them in the same file, twenty lines apart. Two modules each had their
 * own `application/ld+json` reader with the same CDATA strip and the same
 * try/catch-and-continue. And two modules each had their own HTML entity
 * decoder: one with sixty names and a range guard, one with seventeen names
 * and none — `String.fromCodePoint(1114112)` throws `RangeError`, and the
 * seventeen-name copy sat inside `extractRecipeFromHtml`, which nothing
 * wrapped in a try. A page carrying `&#1114112;` took the import down.
 *
 * None of these is interesting enough to be duplicated. They are here so
 * that the recipe extractor, the site profiles, the site learner and the
 * caption reader all read a page the same way, and so that the one range
 * guard is the only one.
 */

/* -------------------------------------------------------------------------- */
/*  Entities                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The named entities that change a word, and no others.
 *
 * Case-sensitive on purpose: `&Uuml;` and `&uuml;` are different letters.
 * Not a full table — an unrecognised `&hellip;` reaching a model as itself
 * costs nothing — but every one that turns up inside a word in German,
 * French or Spanish, because `Ofengem&uuml;se` is not a stray entity, it is
 * a word with rubble in the middle of it.
 */
const NAMED: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
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

/** A code point that is a character, or nothing. */
function fromCodePoint(value: number): string {
    // Zero is not a character, and 0x110000 is where Unicode ends —
    // `String.fromCodePoint` throws past it, and a page can say `&#1114112;`.
    return value > 0 && value < 0x110000 ? String.fromCodePoint(value) : '';
}

export function decodeEntities(text: string): string {
    return text
        .replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (whole, name: string) =>
            Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : whole
        )
        .replace(/&#(\d{1,7});/g, (_, code: string) => fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]{1,6});/gi, (_, code: string) => fromCodePoint(Number.parseInt(code, 16)));
}

/** Tags gone, entities decoded, whitespace collapsed to one space. */
export function plainText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/* -------------------------------------------------------------------------- */
/*  Meta tags                                                                 */
/* -------------------------------------------------------------------------- */

/** The raw `content` attribute of one meta tag, or null when there is none. */
export function metaTag(html: string, property: string): string | null {
    const pattern = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
        'i'
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) return null;

    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    return content ?? null;
}

/** A meta tag as one line. Right for a title, wrong for a caption. */
export function metaContent(html: string, property: string): string {
    const raw = metaTag(html, property);
    return raw ? plainText(raw) : '';
}

/**
 * A meta tag with its line breaks left in.
 *
 * Instagram writes the whole recipe into `og:title` with `&#10;` between the
 * lines, and the rule-based parser is line-based. Flatten it and a perfectly
 * structured ingredient list arrives as one sentence, which parses to
 * nothing. Entities decoded, runs of spaces squeezed, newlines kept, three
 * or more of them reduced to two — a caption often has a dozen blank lines
 * before the hashtags.
 */
export function metaLines(html: string, property: string): string {
    const raw = metaTag(html, property);
    if (!raw) return '';

    return decodeEntities(raw.replace(/<[^>]*>/g, ' '))
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Which of some meta tags a page actually has. */
export function metaTagsPresent(html: string, properties: string[]): string[] {
    return properties.filter((property) => metaTag(html, property) !== null);
}

/* -------------------------------------------------------------------------- */
/*  JSON-LD                                                                   */
/* -------------------------------------------------------------------------- */

const LD_JSON = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** How many `application/ld+json` blocks there are, parseable or not. */
export function jsonLdBlockCount(html: string): number {
    return [...html.matchAll(LD_JSON)].length;
}

/** Every `application/ld+json` block on the page that is valid JSON. */
export function jsonLdDocuments(html: string): unknown[] {
    const documents: unknown[] = [];

    for (const block of html.matchAll(LD_JSON)) {
        try {
            // Strip CDATA wrappers some CMSs add.
            const raw = block[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
            documents.push(JSON.parse(raw));
        } catch {
            continue;
        }
    }

    return documents;
}
