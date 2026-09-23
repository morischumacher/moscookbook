/** People list: who cannot be demoted or deleted */
import { suite, equal } from './harness';
import { protectionOf } from '../src/lib/protection';

export default function userProtectionTests() {
    suite('people: protected accounts');
    equal('not yourself', protectionOf(5, 5, 1, 3), 'self');
    equal('not the owner, by another admin', protectionOf(1, 5, 1, 3), 'owner');
    equal('not the last admin', protectionOf(7, 5, 1, 1), 'lastAdmin');
    equal('anyone else, yes', protectionOf(7, 5, 1, 3), null);
}
