/**
 * "Full recipe on my blog: https://…"
 *
 * A great many cooking videos and posts do not carry the recipe at all — they
 * point at it. The description of a YouTube video, the caption of a reel:
 * "Rezept im Link", "full recipe below", and a link. Until now that link was
 * thrown away with the rest of the description's furniture, and the capture
 * came back as a title with nothing under it.
 *
 * This finds the links worth following: not the author's other channels, not
 * the shop, not the affiliate knife — the one that is probably the recipe.
 */

/** Hosts that are never the recipe: social profiles, shops, link shorteners for shops, tip jars. */
const NEVER_THE_RECIPE =
    /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|threads\.net|pinterest\.[a-z.]+|pin\.it|snapchat\.com|twitch\.tv|discord\.gg|discord\.com|spotify\.com|apple\.com|patreon\.com|ko-fi\.com|paypal\.me|paypal\.com|amazon\.[a-z.]+|amzn\.to|amzn\.eu|geni\.us|ebay\.[a-z.]+|etsy\.com|linkedin\.com|whatsapp\.com|wa\.me|t\.me|telegram\.me|onlyfans\.com|shopmy\.us|ltk\.app|liketk\.it|rstyle\.me|awin1\.com|bit\.ly\/merch)$/i;

/** Words that, on the same line as a link, make it the recipe. */
const RECIPE_WORD = /rezept|recipe|zutaten|ingredients|nachkochen|printable/i;

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

function hostOf(url: string): string | null {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return null;
    }
}

/**
 * The links in a description or caption that may be the recipe, best first,
 * at most `limit`. A link on a line that says "Rezept" or "recipe" comes
 * first; the rest keep the order they were written in.
 */
export function recipeLinksIn(text: string, limit = 2): string[] {
    const found: { url: string; score: number; order: number }[] = [];
    const seen = new Set<string>();
    let order = 0;

    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        // "Rezept:" on its own line, the link on the next one, is as common as
        // both on one line.
        const context = `${lines[index - 1] ?? ''} ${line}`;
        for (const match of line.matchAll(URL_PATTERN)) {
            const url = match[0].replace(/[.,;:!?]+$/, '');
            const host = hostOf(url);
            if (!host || NEVER_THE_RECIPE.test(host) || seen.has(url)) continue;
            seen.add(url);
            found.push({ url, score: RECIPE_WORD.test(context) ? 1 : 0, order: order++ });
        }
    }

    return found
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .slice(0, limit)
        .map((entry) => entry.url);
}
