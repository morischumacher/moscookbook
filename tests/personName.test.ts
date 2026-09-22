import { suite, equal } from './harness';
import { fullName } from '../src/lib/personName';

export default function personNameTests() {
    suite('fullName');

    equal('joins the two parts', fullName({ firstName: 'Emma', lastName: 'Huber' }), 'Emma Huber');
    equal('trims', fullName({ firstName: ' Emma ', lastName: ' Huber ' }), 'Emma Huber');
    equal('copes with no surname', fullName({ firstName: 'Mo', lastName: '' }), 'Mo');
    equal('copes with no first name', fullName({ firstName: '', lastName: 'Huber' }), 'Huber');
    equal('copes with neither', fullName({ firstName: '', lastName: '' }), '');
}
