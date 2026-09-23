/** Security review findings, each pinned so it stays fixed */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check, equal } from './harness';
import { classifyCapture } from '../src/lib/capture';
import { isOurs } from '../src/lib/blobCleanup';

const source = (path: string) => readFileSync(join(__dirname, '..', 'src', path), 'utf8');

export default function securityHuntTests() {
    suite('security: a shared "link" must be a web address');
    const js = classifyCapture({ url: 'javascript:alert(1)' });
    check('javascript: is never stored as the source', js?.sourceUrl !== 'javascript:alert(1)', js);
    equal('an https link still is', classifyCapture({ url: 'https://example.com/r' })?.sourceUrl, 'https://example.com/r');

    suite('security: only our own blob store is ours');
    const before = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_AbC123_secret';
    check('our store', isOurs('https://abc123.public.blob.vercel-storage.com/reports/x.png'));
    check('not somebody else\'s', !isOurs('https://evil9.public.blob.vercel-storage.com/reports/x.png'));
    process.env.BLOB_READ_WRITE_TOKEN = before;
    if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;

    suite('security: routes');
    check('anonymous error reports do not reach the public work list', /await getCurrentUser\(\)\)\) await syncWorkItem/.test(source('app/api/errors/route.ts')));
    check('members do not get collections\' secret links', source('app/api/collections/route.ts').includes('shareToken: user.admin'));
    check('cook photos respect admins-only recipes', source('app/api/recipes/[id]/cooked/photos/route.ts').includes('hiddenFrom(recipeId, user)'));
    check('the share page asks first when another site sent us there', source('app/[locale]/share/page.tsx').includes("sec-fetch-site"));
    check('an address change withdraws older links before answering', /\$transaction\(\[\s*prisma\.authToken\.updateMany/.test(source('app/api/account/email/route.ts')));
}
