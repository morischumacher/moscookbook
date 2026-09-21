/**
 * Reading a recipe out of a YouTube link.
 *
 * Cooking videos almost always carry the recipe in the description — that is
 * what the "full recipe below" in every voiceover refers to. The description is
 * not in the page's visible HTML; it sits inside the JSON blob YouTube embeds
 * for its own player, as `"shortDescription"`. The `<meta name="description">`
 * tag holds only a truncated copy, which is why it is the fallback and not the
 * source.
 *
 * No API key: the watch page is public, and a key would be one more secret to
 * keep, rotate and pay attention to for a personal cookbook.
 *
 * What this does NOT do is read the transcript. For a video whose recipe is
 * only spoken, the description yields a title and a picture and the capture is
 * marked as needing work, rather than a confidently wrong recipe.
 */

/** The eleven-character id, from any of the shapes YouTube hands out. */
export function youtubeVideoId(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const id = (value: string | null): string | null =>
        value && /^[\w-]{11}$/.test(value) ? value : null;

    if (host === 'youtu.be') {
        return id(parsed.pathname.slice(1).split('/')[0] ?? null);
    }

    if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
        return null;
    }

    const watch = id(parsed.searchParams.get('v'));
    if (watch) return watch;

    // /shorts/ID, /embed/ID, /live/ID, /v/ID
    const path = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(parsed.pathname);
    return path ? path[1] : null;
}

export function youtubeWatchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Reads one JSON string value out of raw page source.
 *
 * The page is megabytes of minified JavaScript, so it is not parsed — the key
 * is found and the escaped string after it is walked to its closing quote,
 * honouring backslash escapes, then handed to JSON.parse so that `\n`, `ä`
 * and friends come out as the characters a German recipe is made of.
 */
function jsonStringAfter(html: string, key: string, from = 0): string | null {
    const needle = `"${key}":"`;
    const start = html.indexOf(needle, from);
    if (start === -1) return null;

    let index = start + needle.length;
    let escaped = false;

    for (; index < html.length; index += 1) {
        const character = html[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === '\\') {
            escaped = true;
            continue;
        }
        if (character === '"') break;
    }

    if (index >= html.length) return null;

    try {
        return JSON.parse(`"${html.slice(start + needle.length, index)}"`) as string;
    } catch {
        return null;
    }
}

function metaContent(html: string, selector: RegExp): string | null {
    const match = selector.exec(html);
    if (!match) return null;
    return match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

export interface YoutubePage {
    title: string;
    description: string;
    imageUrl: string;
    channel: string;
}

/**
 * Pulls what a watch page offers. Every field is optional in practice, so each
 * has a fallback and the caller decides whether what came back is enough.
 */
export function extractYoutubePage(html: string, videoId: string): YoutubePage {
    // "title" appears hundreds of times in a watch page — every menu item has
    // one. Anchoring on "videoDetails" is what makes reading the *video's*
    // title rather than a sidebar entry's reliable.
    const details = html.indexOf('"videoDetails"');
    const from = details === -1 ? 0 : details;

    const title =
        (details === -1 ? null : jsonStringAfter(html, 'title', from)) ??
        metaContent(html, /<meta\s+property="og:title"\s+content="([^"]*)"/i) ??
        '';

    const description =
        jsonStringAfter(html, 'shortDescription', from) ??
        metaContent(html, /<meta\s+property="og:description"\s+content="([^"]*)"/i) ??
        '';

    const imageUrl =
        metaContent(html, /<meta\s+property="og:image"\s+content="([^"]*)"/i) ??
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

    const channel =
        jsonStringAfter(html, 'ownerChannelName') ??
        metaContent(html, /<link\s+itemprop="name"\s+content="([^"]*)"/i) ??
        '';

    return { title: title.trim(), description: description.trim(), imageUrl, channel: channel.trim() };
}

/**
 * Strips the furniture a YouTube description carries around the recipe.
 *
 * Descriptions end in affiliate links, chapter timestamps, social handles and
 * subscribe pleas. Feeding all of that to the recipe parser turns "00:00
 * Intro" into an ingredient. The cut is deliberately conservative: only lines
 * that are unmistakably furniture go, because losing a real ingredient is
 * worse than keeping a stray link.
 */
export function cleanYoutubeDescription(description: string): string {
    const lines = description.split('\n');
    const kept: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Chapter markers: "0:00 Intro", "12:34 - Die Sauce"
        if (/^\d{1,2}:\d{2}(:\d{2})?\b/.test(trimmed)) continue;

        // A line that is nothing but a link.
        if (/^https?:\/\/\S+$/i.test(trimmed)) continue;

        // Social furniture and the usual German and English pleas.
        //
        // No \b after the alternatives: German inflects, and "Abonniert" ends
        // in a word character, so a boundary there would quietly match
        // nothing — which is exactly the bug the test caught. "Shop" is
        // deliberately absent; a line that is only a shop link is already gone
        // above, and the bare word is too common to drop safely.
        if (
            /^(abonnier|subscribe|folge?t? mir|follow me|instagram|tiktok|facebook|twitter|patreon|merch|werbung|anzeige|affiliate|rabattcode|discount code)/i.test(
                trimmed
            )
        ) {
            continue;
        }

        kept.push(line);
    }

    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
