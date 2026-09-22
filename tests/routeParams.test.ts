/** routeParams — the one way an id is read off a URL */
import { suite, equal } from './harness';
import { positiveIntId } from '../src/lib/routeParams';

/**
 * Twenty-one route files used to parse this by hand, in two flavours. Both
 * accepted `12abc` — `Number.parseInt` stops at the first bad character and
 * returns what it had — and one accepted `0` and negatives. The checks below
 * are the cases the two flavours disagreed on, plus the ones neither
 * considered.
 */
export default function routeParamsTests() {
    suite('positiveIntId');

    equal('an ordinary id', positiveIntId('42'), 42);
    equal('one', positiveIntId('1'), 1);

    // What parseInt used to let through.
    equal('digits followed by letters are not an id', positiveIntId('12abc'), null);
    equal('a decimal is not an id', positiveIntId('1.5'), null);
    equal('scientific notation is not an id', positiveIntId('1e3'), null);
    equal('hex is not an id', positiveIntId('0x10'), null);
    equal('leading whitespace is not an id', positiveIntId(' 7'), null);

    // What the NaN-only flavour let through.
    equal('zero is not an id', positiveIntId('0'), null);
    equal('a negative number is not an id', positiveIntId('-3'), null);
    equal('a plus sign is not an id', positiveIntId('+3'), null);

    equal('empty is not an id', positiveIntId(''), null);
    equal('null is not an id', positiveIntId(null), null);
    equal('undefined is not an id', positiveIntId(undefined), null);

    // A number Postgres cannot hold in an integer column is refused here
    // rather than at the database, where it would be a 500.
    equal('a sixteen-digit number is refused', positiveIntId('1234567890123456'), null);
    equal('but fifteen digits still parse', positiveIntId('123456789012345'), 123456789012345);
}
