/**
 * "Recipe on pattyplates.com (link in bio)": finding it there.
 *
 * Many food accounts post the dish and keep the recipe on their own website.
 * The link in the bio cannot be read (it is behind Instagram's login), but the
 * caption often names the site, and the dish is in the first line. So: search
 * the site for the dish, take the result whose title matches, and read that
 * page — usually by the rules alone, because a recipe blog has recipe markup.
 *
 * And remember which site an account keeps its recipes on, so the next post
 * that only says "link in bio" can be looked up the same way.
 *
 * Only the pure half lives here — reading captions, building search addresses,
 * choosing a result. The fetching is in captureProcess, the remembering in
 * accountSiteDb.
 */

/** Hosts that are never an author's recipe site. */
const NOT_A_RECIPE_SITE =
    /(^|\.)(instagram|tiktok|youtube|youtu|facebook|fb|twitter|x|threads|pinterest|linktr|linkin|beacons|amazon|amzn|bit|tinyurl|spotify|apple|google|gmail|patreon|substack|shopmy|liketk|ltk)\.[a-z.]+$/i;

const DOMAIN = /(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|de|net|org|co\.uk|co|at|ch|nl|fr|it|es|io|blog|kitchen|recipes|food|cooking|me|uk|au|ca))(?![\w-])/gi;

/** Websites a caption names, bare or as links, most likely first. */
export function sitesInText(text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(DOMAIN)) {
        const host = match[1].toLowerCase().replace(/^www\./, '');
        if (NOT_A_RECIPE_SITE.test(host) || found.includes(host)) continue;
        found.push(host);
    }
    return found.slice(0, 2);
}

/** The account a TikTok link names: tiktok.com/@handle/video/…. */
export function handleFromUrl(url: string): string | null {
    const match = /tiktok\.com\/@([\w.]+)/i.exec(url);
    return match ? match[1].toLowerCase() : null;
}

/** Where a caption stops naming the dish and starts selling something. */
const CALL_TO_ACTION =
    /\b(comment|kommentier\w*|link in|(recipe|rezept) ?link|recipe (in|on|at|below|up)|rezept (in|auf|unten|im)|full recipe|get the recipe|dm|go to|find the|save this|follow|folg\w*|ad\b|anzeige|werbung)\b|#|@|https?:|\b[a-z0-9-]+\.(com|de|net|org|co)\b/i;

const FILLER = new Set([
    'the', 'and', 'with', 'a', 'an', 'of', 'my', 'best', 'easy', 'quick', 'recipe', 'recipes', 'homemade',
    'der', 'die', 'das', 'und', 'mit', 'ein', 'eine', 'rezept', 'einfach', 'schnell', 'beste',
]);

function words(text: string): string[] {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9ß]+/)
        .filter((word) => word.length > 1 && !FILLER.has(word));
}

/**
 * The dish, from the first line of a caption: "Corn Kakiage Comment “corn” to
 * get the recipe…" is "Corn Kakiage". Empty when nothing is left.
 */
export function dishName(caption: string): string {
    const first = caption.split('\n').find((line) => line.trim() !== '') ?? '';
    const cut = CALL_TO_ACTION.exec(first);
    const head = (cut ? first.slice(0, cut.index) : first)
        .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, ' ')
        .replace(/[|•·:–—-]+\s*$/u, '')
        .replace(/\s+/g, ' ')
        .trim();
    // "… recipe", "Rezept:" left over at the end say nothing about the dish.
    const kept = head.split(' ');
    while (kept.length > 0 && FILLER.has(kept[kept.length - 1].toLowerCase().replace(/[^\p{L}]/gu, ''))) kept.pop();
    return words(kept.join(' ')).length === 0 ? '' : kept.slice(0, 8).join(' ');
}

/** WordPress's own search API first (clean JSON), its search page second. */
export function searchUrls(host: string, dish: string): string[] {
    const query = encodeURIComponent(dish);
    return [
        `https://${host}/wp-json/wp/v2/posts?search=${query}&per_page=5&_fields=link,title`,
        `https://${host}/?s=${query}`,
    ];
}

export interface SearchResult {
    url: string;
    title: string;
}

export function resultsFromWpJson(body: string): SearchResult[] {
    try {
        const parsed: unknown = JSON.parse(body);
        if (!Array.isArray(parsed)) return [];
        return parsed.flatMap((entry) => {
            const link = (entry as { link?: unknown }).link;
            const title = (entry as { title?: { rendered?: unknown } }).title?.rendered;
            return typeof link === 'string' ? [{ url: link, title: typeof title === 'string' ? title.replace(/<[^>]+>/g, '') : '' }] : [];
        });
    } catch {
        return [];
    }
}

/** Links on a search results page that could be a post of that site. */
export function resultsFromSearchHtml(html: string, host: string): SearchResult[] {
    const results: SearchResult[] = [];
    for (const match of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        let url: URL;
        try {
            url = new URL(match[1], `https://${host}/`);
        } catch {
            continue;
        }
        if (url.hostname.replace(/^www\./, '') !== host) continue;
        if (url.pathname === '/' || url.search || /\/(tag|category|author|page|wp-|feed|shop|about|contact)/i.test(url.pathname)) continue;
        const title = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (title && !results.some((result) => result.url === url.href)) results.push({ url: url.href, title });
    }
    return results;
}

/**
 * The result that is this dish: most of the dish's words in its title (or its
 * address, which on a blog is the title). A search that returns something
 * else is a search that did not find it.
 */
export function pickResult(results: SearchResult[], dish: string): string | null {
    const wanted = words(dish);
    if (wanted.length === 0) return null;
    let best: { url: string; score: number } | null = null;
    for (const result of results) {
        let path = '';
        try {
            path = decodeURIComponent(new URL(result.url).pathname);
        } catch {
            continue;
        }
        const have = new Set([...words(result.title), ...words(path)]);
        const score = wanted.filter((word) => have.has(word)).length / wanted.length;
        if (score >= 0.5 && (!best || score > best.score)) best = { url: result.url, score };
    }
    return best?.url ?? null;
}

/** An account's site, remembered. See accountSiteDb.ts. */
export interface AccountSiteStore {
    get(platform: string, handle: string): Promise<string | null>;
    remember(platform: string, handle: string, host: string): Promise<void>;
}

export const NO_ACCOUNT_SITES: AccountSiteStore = {
    get: async () => null,
    remember: async () => undefined,
};
