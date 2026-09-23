import { suite, equal, check } from './harness';
import { sinceCooked } from '../src/lib/sinceCooked';

/**
 * "Three weeks ago", which is the only question a cooking log answers.
 *
 * The one that matters is the midnight boundary: something cooked at eleven
 * last night was cooked *yesterday*, whatever the clock says now. Subtracting
 * milliseconds gets that wrong for eleven hours of every day.
 */
export default function sinceCookedTests() {
    suite('how long ago');

    // Wall-clock times in Berlin (summer time, UTC+2), which is whose
    // midnight counts — whatever time zone the tests run in.
    const at = (year: number, month: number, day: number, hour = 12) =>
        new Date(Date.UTC(year, month, day, hour - 2));
    // A Tuesday afternoon.
    const now = at(2026, 8, 22, 15);

    equal('this morning', sinceCooked(at(2026, 8, 22, 8), now), { key: 'today', count: 0 });

    equal(
        'eleven last night',
        sinceCooked(at(2026, 8, 21, 23), now),
        { key: 'yesterday', count: 1 },
        );

    check(
        'and not "sixteen hours"',
        sinceCooked(at(2026, 8, 21, 23), now).key === 'yesterday',
        'the boundary is midnight, not a multiple of twenty-four hours'
    );

    equal('three days', sinceCooked(at(2026, 8, 19), now), { key: 'days', count: 3 });
    equal('thirteen days is still days', sinceCooked(at(2026, 8, 9), now), { key: 'days', count: 13 });

    equal('two weeks', sinceCooked(at(2026, 8, 8), now), { key: 'weeks', count: 2 });
    equal('seven weeks is still weeks', sinceCooked(at(2026, 7, 4), now), { key: 'weeks', count: 7 });

    equal('three months', sinceCooked(at(2026, 5, 24), now), { key: 'months', count: 3 });
    equal('half a year', sinceCooked(at(2026, 2, 26), now), { key: 'months', count: 6 });

    equal('a year', sinceCooked(at(2025, 8, 1), now), { key: 'years', count: 1 });
    equal('three years', sinceCooked(at(2023, 5, 1), now), { key: 'years', count: 3 });

    /* ------------------------------------------------------------ edges */

    equal(
        'a date in the future reads as today rather than as nonsense',
        sinceCooked(at(2026, 8, 30), now),
        { key: 'today', count: 0 }
    );

    equal(
        'a string, which is what an API hands back',
        sinceCooked('2026-09-19T12:00:00.000Z', new Date('2026-09-22T15:00:00.000Z')).key,
        'days'
    );

    check(
        'a year is never "0 years"',
        sinceCooked(at(2025, 8, 23), now).count >= 1,
        'rounding down at the boundary would say "0 years ago"'
    );
}
