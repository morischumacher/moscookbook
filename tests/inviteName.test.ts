/** Invitations: the name somebody is invited under */
import { suite, equal } from './harness';
import { checkName, registeredName } from '../src/lib/inviteName';

export default function inviteNameTests() {
    const taken = [
        { firstName: 'Mo', lastName: 'Schumacher' },
        { firstName: 'Anna', lastName: '' },
    ];

    suite('invitations: is the name free');
    equal('a new first name is free', checkName({ firstName: 'Lena', lastName: '' }, taken).state, 'free');
    equal('a taken first name is said, with who has it', checkName({ firstName: ' mo ', lastName: '' }, taken), { state: 'firstTaken', holders: ['Mo Schumacher'] });
    equal('a last name makes it free again', checkName({ firstName: 'Mo', lastName: 'Berger' }, taken).state, 'free');
    equal('unless the whole name is taken too', checkName({ firstName: 'Mo', lastName: 'schumacher' }, taken).state, 'fullTaken');
    equal('nothing typed yet is not a clash', checkName({ firstName: '', lastName: '' }, taken).state, 'free');

    suite('invitations: the name the account gets');
    equal('the invitation wins over what was typed',
        registeredName({ firstName: 'Hacker', lastName: 'Müller' }, { firstName: 'Lena', lastName: null }),
        { firstName: 'Lena', lastName: 'Müller' });
    equal('an invitation without a name takes what was typed',
        registeredName({ firstName: 'Lena', lastName: 'Müller' }, { firstName: null, lastName: null }),
        { firstName: 'Lena', lastName: 'Müller' });
}
