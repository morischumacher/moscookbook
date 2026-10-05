/** The ingredient editor's number and unit, from and back to the stored amount */
import { suite, equal } from './harness';
import { joinFromEditor, splitForEditor } from '../src/lib/unitChoice';

export default function unitChoiceTests() {
    suite('unit choice: what an amount is split into');
    equal('grams', splitForEditor('200 g'), { quantity: '200', choice: 'g', custom: '' });
    equal('Tbsp is the tablespoon', splitForEditor('2 Tbsp'), { quantity: '2', choice: 'tbsp', custom: '' });
    equal('Essl. too', splitForEditor('1 Esslöffel'), { quantity: '1', choice: 'tbsp', custom: '' });
    equal('a fraction', splitForEditor('1 1/2 cups'), { quantity: '1 1/2', choice: 'cup', custom: '' });
    equal('a range', splitForEditor('2-3 Zehen'), { quantity: '2-3', choice: 'clove', custom: '' });
    equal('a hedge stays with the number', splitForEditor('ca. 200 g'), { quantity: 'ca. 200', choice: 'g', custom: '' });
    equal('a word of its own', splitForEditor('1 kleine Dose'), { quantity: '1', choice: 'custom', custom: 'kleine Dose' });
    equal('no number', splitForEditor('etwas'), { quantity: '', choice: 'custom', custom: 'etwas' });
    equal('nothing', splitForEditor(''), { quantity: '', choice: '', custom: '' });
    equal('a count', splitForEditor('3'), { quantity: '3', choice: '', custom: '' });

    suite('unit choice: joined again');
    equal('in German', joinFromEditor({ quantity: '2', choice: 'tbsp', custom: '' }, 'de'), '2 EL');
    equal('cups agree', joinFromEditor({ quantity: '2', choice: 'cup', custom: '' }, 'en'), '2 cups');
    equal('one Tasse', joinFromEditor({ quantity: '1', choice: 'cup', custom: '' }, 'de'), '1 Tasse');
    equal('a pinch', joinFromEditor({ quantity: '1', choice: 'pinch', custom: '' }, 'de'), '1 Prise');
    equal('own words', joinFromEditor({ quantity: '1', choice: 'custom', custom: 'Bund' }, 'de'), '1 Bund');
    equal('a typed space is not stored', joinFromEditor({ quantity: '1 ', choice: 'g', custom: '' }, 'de'), '1 g');
}
