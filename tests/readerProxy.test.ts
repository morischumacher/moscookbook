/** The reader proxy's address: r.jina.ai unless another is named, never for JSON (work #9/#10, owner's switch) */
import { suite, equal } from './harness';
import { readerProxyUrl } from '../src/lib/readerProxy';

export default function readerProxyTests() {
    suite('reader proxy: where a blocked page is asked again');
    const before = process.env.SCRAPING_PROXY_URL;
    delete process.env.SCRAPING_PROXY_URL;
    equal('r.jina.ai by default', readerProxyUrl('https://www.maangchi.com/recipe/x', false), 'https://r.jina.ai/https%3A%2F%2Fwww.maangchi.com%2Frecipe%2Fx');
    equal('not for a search API answer', readerProxyUrl('https://example.com/api', true), null);
    process.env.SCRAPING_PROXY_URL = 'https://proxy.example/?u={url}';
    equal('a named proxy instead', readerProxyUrl('https://a.b/c', true), 'https://proxy.example/?u=https%3A%2F%2Fa.b%2Fc');
    if (before === undefined) delete process.env.SCRAPING_PROXY_URL;
    else process.env.SCRAPING_PROXY_URL = before;
}
