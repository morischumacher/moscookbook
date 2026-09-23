/** The public work list: what goes out, and what never does */
import { suite, equal, check } from './harness';
import { anonymize, captureSnapshot, errorSnapshot, ticketSnapshot, workTitle } from '../src/lib/workItems';

export default function workItemTests() {
    const people = ['Moritz Schumacher', 'Moritz', 'Schumacher', 'Ann', 'Jo'];

    suite('work list: people are taken out');
    equal('an address', anonymize('Schreib an moritz.j.schumacher@gmail.com bitte', people), 'Schreib an [E-Mail] bitte');
    equal('a full name before its parts', anonymize('Moritz Schumacher meinte, Moritz habe recht', people), '[Person] meinte, [Person] habe recht');
    equal('any case, whole words only', anonymize('ANN sagt: Annette und Hannover bleiben', people), '[Person] sagt: Annette und Hannover bleiben');
    equal('short names are left alone', anonymize('Joghurt von Jo', people), 'Joghurt von Jo');
    equal('a share link', anonymize('kaputt auf /de/s/AbCdEfGhIjKlMnOpQrSt', []), 'kaputt auf /de/s/[token]');
    equal('an e-mail token', anonymize('/de/reset?token=abc123&x=1', []), '/de/reset?token=[token]&x=1');
    equal('nothing is nothing', anonymize(null, people), '');

    suite('work list: snapshots');
    const ticket = ticketSnapshot({ kind: 'bug', body: 'Hallo, hier Ann (ann@x.de): Suche geht nicht', path: '/de', createdAt: new Date('2026-09-23T10:00:00Z') }, people);
    equal('a ticket without its author', ticket.body, 'Hallo, hier [Person] ([E-Mail]): Suche geht nicht');
    check('and no user field at all', !('user' in ticket) && !('userId' in ticket), ticket);

    const capture = captureSnapshot(
        {
            id: 1,
            kind: 'url',
            source: 'instagram',
            sourceUrl: 'https://www.instagram.com/p/DAbc123xyz/',
            rawText: 'Von Moritz geteilt',
            imageUrl: 'https://blob.example/screenshot.jpg',
            status: 'needsWork',
            error: 'reason:recipeInBio',
            readBy: 'rules',
            aiProvider: null,
            createdAt: new Date('2026-09-23T10:00:00Z'),
            draft: { title: 'Pasta', ingredients: [{ amount: '200 g', item: 'Spaghetti' }], instructions: '', imageUrl: 'x' },
        },
        people
    );
    equal('the post link stays', capture.sourceUrl, 'https://www.instagram.com/p/DAbc123xyz/');
    equal('the shared text loses its people', capture.sharedText, 'Von [Person] geteilt');
    equal('the screenshot is only mentioned', capture.hadScreenshot, true);
    check('never linked', !JSON.stringify(capture).includes('blob.example'), capture);
    equal('ingredients as lines', capture.draft?.ingredients, ['200 g Spaghetti']);

    const error = errorSnapshot({ source: 'server', message: 'Failed for Schumacher', stack: null, path: '/de/r/AbCdEfGhIjKlMnOpQrSt', count: 3, firstSeenAt: new Date(0), lastSeenAt: new Date(0) }, people);
    equal('an error message', error.message, 'Failed for [Person]');
    equal('an error path', error.path, '/de/r/[token]');

    equal('a title for the list', workTitle('ticket', ticket), 'Hallo, hier [Person] ([E-Mail]): Suche geht nicht');
}
