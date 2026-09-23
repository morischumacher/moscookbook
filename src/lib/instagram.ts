import { jsonStringAfter } from './youtube';

/**
 * Reading an Instagram post without an account.
 *
 * The post's own page is a login wall for anything that is not a browser with
 * cookies, and what it lets through is the caption cut off in `og:title`. The
 * *embed* page is different: it is what Instagram serves to every blog that
 * embeds a post, it needs no login by design, and with `/captioned/` it
 * carries the whole caption and the picture.
 *
 * Only public posts, of course — which is all a share link from someone
 * else's feed is anyway.
 */

/** The post's code from any of the shapes a share hands over: /p/, /reel/, /reels/, /tv/. */
export function instagramShortcode(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
    const match = /^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]{5,})/.exec(parsed.pathname);
    return match ? match[1] : null;
}

export function instagramEmbedUrl(shortcode: string): string {
    return `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
}

/** The named ones a German or French caption actually uses. */
const NAMED: Record<string, string> = {
    Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß',
    eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ntilde: 'ñ', hellip: '…',
    ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°', frac12: '½', frac14: '¼',
};

function decodeEntities(text: string): string {
    return text
        .replace(/&([A-Za-z]+\d*);/g, (entity, name: string) => NAMED[name] ?? entity)
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

export interface InstagramEmbed {
    caption: string;
    imageUrl: string;
    author: string;
}

/**
 * The caption and picture from an embed page.
 *
 * Two shapes, because Instagram has served both: the caption as markup in
 * `<div class="Caption">`, username link first; or as JSON inside the page's
 * script, under `edge_media_to_caption`. The markup is tried first because it
 * is what a reader sees.
 */
export function readInstagramEmbed(html: string): InstagramEmbed {
    let caption = '';
    let author = '';

    const block = /<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i.exec(html)
        ?? /<div class="Caption"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (block) {
        let inner = block[1];
        const username = /<a[^>]*class="CaptionUsername"[^>]*>([\s\S]*?)<\/a>/i.exec(inner);
        if (username) {
            author = decodeEntities(username[1].replace(/<[^>]+>/g, '')).trim();
            inner = inner.replace(username[0], '');
        }
        caption = decodeEntities(
            inner
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>|<\/div>/gi, '\n')
                .replace(/<[^>]+>/g, '')
        );
    }

    if (!caption.trim()) {
        // The JSON shape, sometimes escaped twice because it sits inside a
        // string inside the script.
        const at = html.indexOf('edge_media_to_caption');
        if (at !== -1) {
            const direct = jsonStringAfter(html, 'text', at);
            if (direct) caption = direct;
            else {
                const unescaped = html.slice(at, at + 20_000).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                caption = jsonStringAfter(unescaped, 'text') ?? '';
            }
        }
    }

    const image =
        /<img[^>]*class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i.exec(html) ??
        /<img[^>]*src="([^"]+)"[^>]*class="EmbeddedMediaImage"/i.exec(html);

    return {
        caption: caption.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
        imageUrl: image ? decodeEntities(image[1]) : '',
        author,
    };
}
