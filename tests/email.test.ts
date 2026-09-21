import { suite, equal, check } from './harness';
import { subjectAsTitle, stripEmailFurniture, emailToCapture } from '../src/lib/email';
import { classifyCapture } from '../src/lib/capture';
import { processCapture } from '../src/lib/captureProcess';

export default async function emailTests() {
    suite('subjectAsTitle');

    equal('leaves a plain subject alone', subjectAsTitle('Omas Apfelkuchen'), 'Omas Apfelkuchen');
    equal('strips a German forward', subjectAsTitle('WG: Omas Apfelkuchen'), 'Omas Apfelkuchen');
    equal('strips an English forward', subjectAsTitle('Fwd: Omas Apfelkuchen'), 'Omas Apfelkuchen');
    equal('strips a German reply', subjectAsTitle('AW: Omas Apfelkuchen'), 'Omas Apfelkuchen');
    equal(
        'strips the pile a twice-forwarded mail collects',
        subjectAsTitle('WG: Fwd: Re: Omas Apfelkuchen'),
        'Omas Apfelkuchen'
    );
    equal('handles the numbered form', subjectAsTitle('Re[2]: Omas Apfelkuchen'), 'Omas Apfelkuchen');
    equal('survives an empty subject', subjectAsTitle('   '), '');

    // "Reis" starts with "Re" but is not a reply prefix — the colon is what
    // makes one, and without this check a rice dish loses its name.
    equal('does not mistake a word for a prefix', subjectAsTitle('Reis mit Gemüse'), 'Reis mit Gemüse');

    suite('stripEmailFurniture');

    const forwarded = [
        '---------- Weitergeleitete Nachricht ----------',
        'Von: Anna <anna@example.com>',
        'Datum: Mo., 21. Sep. 2026 um 10:00',
        'Betreff: Kuchen',
        'An: Mo <moscookbook@gmail.com>',
        '',
        'Omas Apfelkuchen',
        '',
        '200 g Mehl',
        '100 g Zucker',
        '3 Eier',
        '',
        'Alles verrühren und 40 Minuten backen.',
        '',
        '--',
        'Anna Beispiel',
        'anna@example.com',
    ].join('\n');

    const cleaned = stripEmailFurniture(forwarded);

    check('keeps the recipe after a forward header', cleaned.startsWith('Omas Apfelkuchen'), cleaned);
    check('keeps every ingredient', cleaned.includes('3 Eier'), cleaned);
    check('drops the forward separator', !cleaned.includes('Weitergeleitete'), cleaned);
    check('drops the header lines', !cleaned.includes('anna@example.com'), cleaned);
    check('cuts the signature off', !cleaned.includes('Anna Beispiel'), cleaned);

    // A recipe that has been replied to arrives entirely quoted. Dropping those
    // lines instead of unquoting them would leave nothing at all.
    const quoted = [
        'Am 21.09.2026 um 10:00 schrieb Anna:',
        '> Omas Apfelkuchen',
        '> 200 g Mehl',
        '> 3 Eier',
        '',
        'Gesendet von meinem iPhone',
    ].join('\n');

    const unquoted = stripEmailFurniture(quoted);

    equal('unquotes rather than discarding', unquoted, 'Omas Apfelkuchen\n200 g Mehl\n3 Eier');
    check('drops the attribution line', !unquoted.includes('schrieb Anna'), unquoted);
    check('cuts the phone footer', !unquoted.includes('Gesendet von'), unquoted);

    equal('survives an empty body', stripEmailFurniture(''), '');
    equal(
        'copes with Windows line endings',
        stripEmailFurniture('200 g Mehl\r\n3 Eier'),
        '200 g Mehl\n3 Eier'
    );

    suite('emailToCapture');

    const capture = emailToCapture('WG: Omas Kuchen', '> 200 g Mehl\n\n--\nAnna');
    equal('cleans the subject', capture.title, 'Omas Kuchen');
    equal('cleans the body', capture.text, '200 g Mehl');

    suite('an e-mail all the way through');

    // The subject must not become the recipe's name by being glued in front of
    // the body: the parser names a recipe after its first line.
    const mail = emailToCapture(
        'Fwd: schau mal',
        [
            'Spaghetti Aglio e Olio',
            '',
            'Zutaten',
            '400 g Spaghetti',
            '4 Knoblauchzehen',
            '1 Chili',
            '',
            'Zubereitung',
            'Knoblauch in Öl anbraten und mit den Nudeln mischen.',
            '',
            '--',
            'Anna',
        ].join('\n')
    );

    const classified = classifyCapture({ text: mail.text, note: mail.title, via: 'email' });
    equal('is recorded as having arrived by mail', classified?.source, 'email');

    const processed = await processCapture(classified!);

    equal('a forwarded recipe is ready to publish', processed.status, 'ready');
    equal('named after the dish, not the subject', processed.draft?.title, 'Spaghetti Aglio e Olio');
    equal('with its ingredients', processed.draft?.ingredients.length, 3);

    // A forwarded link must still be handled by its host: arriving by mail does
    // not change what a YouTube link needs.
    const link = classifyCapture({
        text: 'Schau mal\nhttps://www.youtube.com/watch?v=abcdefghijk',
        via: 'email',
    });
    equal('a link in a mail is still handled as its own source', link?.source, 'youtube');
}
