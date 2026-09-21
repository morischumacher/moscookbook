type Fetch = typeof globalThis.fetch;

export interface StubbedPage {
    html: string;
    status?: number;
    /** Where the request ended up, when the stub is standing in for a redirect. */
    finalUrl?: string;
    contentType?: string;
}

/**
 * Stands in for the network.
 *
 * Every import test drives the real pipeline; only the last inch — the actual
 * request — is replaced. That is deliberate: a test that mocked the extractor
 * would tell us our fixtures parse, which is not the question. A URL with no
 * entry answers 404, which is how a blocked page and a dead link both look
 * from here.
 */
export function stubFetch(pages: Record<string, StubbedPage>): () => void {
    const original = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        const page = pages[url];

        if (!page) {
            return {
                ok: false,
                status: 404,
                url,
                headers: new Headers({ 'content-type': 'text/html' }),
                text: async () => '',
            } as Response;
        }

        return {
            ok: (page.status ?? 200) < 400,
            status: page.status ?? 200,
            url: page.finalUrl ?? url,
            headers: new Headers({
                'content-type': page.contentType ?? 'text/html; charset=utf-8',
            }),
            text: async () => page.html,
        } as Response;
    }) as Fetch;

    return () => {
        globalThis.fetch = original;
    };
}
