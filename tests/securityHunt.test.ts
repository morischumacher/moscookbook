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
    check('anonymous error reports do not reach the public work list', source('app/api/errors/route.ts').includes('if (row && signedIn) await syncWorkItem'));
    check('members do not get collections\' secret links', source('app/api/collections/route.ts').includes('shareToken: user.admin'));
    check('cook photos respect admins-only recipes', source('app/api/recipes/[id]/cooked/photos/route.ts').includes('hiddenFrom(recipeId, user)'));
    check('the share page asks first when another site sent us there', source('app/[locale]/share/page.tsx').includes("sec-fetch-site"));
    check('an address change withdraws older links before answering', /\$transaction\(\[\s*prisma\.authToken\.updateMany/.test(source('app/api/account/email/route.ts')));

    suite('task list: reporting done');
    const done = source('app/api/work/[id]/done/route.ts');
    check('reporting done needs the task key', done.includes('workTokenValid(req.headers.get(\'authorization\'))'));
    check('and closes nothing by itself', !done.includes('closeWorkItem'));
    const db = source('lib/workItemsDb.ts');
    check('only an open task can be reported done', db.includes('where: { id, closedAt: null, dismissedAt: null, doneAt: null }'));
    check('an error seen again well after the report reopens it', db.includes('item.doneAt.getTime() + RECURRENCE_GRACE_MS'));
    check('and the report is kept in the note, not thrown away', db.includes('but it happened again.'));
    check('a report does not replace one already waiting', /where: \{ id, closedAt: null, dismissedAt: null, doneAt: null \}/.test(db));
    check('confirm and reject only act on a task still waiting', (db.match(/doneAt: \{ not: null \}, closedAt: null/g) ?? []).length >= 2);
    check('re-sharing clears an old report', /createdAt: new Date\(\), doneAt: null, doneNote: null, doneRef: null/.test(db));
    check('only trusted errors become tasks by themselves', db.includes('errorIsObvious(row.trusted)'));
    const errorsRoute = source('app/api/errors/route.ts');
    check('an anonymous report neither reopens nor moves last seen', errorsRoute.includes(': { count: { increment: 1 } }'));
    const pub = source('app/api/work/route.ts');
    check('reported tasks leave the open list', pub.includes('awaitingConfirmation'));
    check('notes and summaries are scrubbed on the public list', pub.includes('anonymize(item.note, people)') && pub.includes('anonymize(item.doneNote, people)'));
    check('the key is kept only as a hash', source('lib/workToken.ts').includes('hashToken(token)'));
}
