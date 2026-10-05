import prisma from './prisma';

/**
 * The reader proxy: a page that refuses the cookbook's own request (403, or
 * 503 from a bot wall) is asked for once more through a reading service,
 * r.jina.ai unless SCRAPING_PROXY_URL names another. Sites like maangchi.com
 * answer every server with a refusal and a person's browser with the recipe.
 *
 * The cost of it: the address of such a page goes to that service, and the
 * import then depends on it being up. So it is a switch under admin → AI, on
 * unless the admin turns it off (the owner's choice).
 */
const KEY = 'fetch.readerProxy';

export async function readerProxyOn(): Promise<boolean> {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY }, select: { value: true } }).catch(() => null);
    return row?.value !== 'off';
}

export async function setReaderProxy(on: boolean): Promise<void> {
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: on ? 'on' : 'off' }, create: { key: KEY, value: on ? 'on' : 'off' } });
}

/** The address to ask through, or null when there is none for this request. */
export function readerProxyUrl(url: string, json: boolean): string | null {
    const template = process.env.SCRAPING_PROXY_URL || (json ? undefined : 'https://r.jina.ai/{url}');
    if (!template) return null;
    return template.includes('{url}') ? template.replace('{url}', encodeURIComponent(url)) : `${template}${encodeURIComponent(url)}`;
}
