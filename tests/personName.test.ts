import { suite, equal } from './harness';
import { fullName, splitName } from '../src/lib/personName';

export default function personNameTests() {
    suite('fullName');

    equal('joins the two parts', fullName({ firstName: 'Emma', lastName: 'Huber' }), 'Emma Huber');
    equal('trims', fullName({ firstName: ' Emma ', lastName: ' Huber ' }), 'Emma Huber');
    equal('copes with no surname', fullName({ firstName: 'Mo', lastName: '' }), 'Mo');
    equal('copes with no first name', fullName({ firstName: '', lastName: 'Huber' }), 'Huber');
    equal('copes with neither', fullName({ firstName: '', lastName: '' }), '');

    suite('splitName');

    equal('a plain name', splitName('Emma Huber'), { firstName: 'Emma', lastName: 'Huber' });
    equal(
        'two given names',
        splitName('Anna Maria Huber'),
        { firstName: 'Anna Maria', lastName: 'Huber' }
    );
    equal('one word keeps it as the first name', splitName('Mo'), { firstName: 'Mo', lastName: '' });
    equal('nothing', splitName('   '), { firstName: '', lastName: '' });
    equal('collapses stray spacing', splitName('  Max   Mustermann  '), { firstName: 'Max', lastName: 'Mustermann' });

    // The whole reason this is not a one-line split: a particle belongs to the
    // surname, and splitting at the last space would make "von" a first name.
    equal('a German particle', splitName('Anna von Bergen'), { firstName: 'Anna', lastName: 'von Bergen' });
    equal('a Dutch one', splitName('Jan van den Berg'), { firstName: 'Jan', lastName: 'van den Berg' });
    equal('an Italian one', splitName('Luca di Marco'), { firstName: 'Luca', lastName: 'di Marco' });
    equal('capitalised', splitName('Anna Von Bergen'), { firstName: 'Anna', lastName: 'Von Bergen' });

    // A surname that happens to be a particle word on its own must not swallow
    // the whole name.
    equal('a particle as the only surname', splitName('Maria De'), { firstName: 'Maria', lastName: 'De' });

    suite('splitName and fullName agree');

    for (const name of ['Emma Huber', 'Mo', 'Anna von Bergen', 'Jan van den Berg', 'Anna Maria Huber']) {
        equal(`round trip: ${name}`, fullName(splitName(name)), name);
    }
}
