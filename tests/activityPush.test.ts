import { suite, equal, check } from './harness';
import { buildPush, shorten, stars, type ActivityRow } from '../src/lib/activityPush';

/**
 * What lands on the owner's phone. The bundling is the part worth testing:
 * one evening's cooking must be one line, a run of events one message.
 */
const SITE = 'https://cook.test/';

function row(partial: Partial<ActivityRow>): ActivityRow {
    return {
        kind: 'rating',
        actorName: 'Anna',
        recipeTitle: 'Linsen-Dal',
        recipeSlug: 'linsen-dal',
        amount: null,
        text: null,
        ...partial,
    };
}

export default function activityPushTests() {
    suite('activityPush');

    equal('nothing waiting is no push', buildPush([], SITE), null);

    equal('stars fill from the left', stars(4), '★★★★☆');
    equal('stars are clamped', stars(9), '★★★★★');

    equal('a short text stays', shorten('Halb so viel Chili'), 'Halb so viel Chili');
    const long = shorten('wort '.repeat(40), 30);
    check('a long text is cut on a word', long.endsWith('…') && long.length <= 30, long);

    equal('a single rating', buildPush([row({ amount: 4 })], SITE), {
        title: 'Linsen-Dal',
        message: 'Anna: ★★★★☆',
        click: 'https://cook.test/de/recipe/linsen-dal',
        tags: ['star'],
    });

    equal(
        'cooked, a note and photos by one person fold into one line',
        buildPush(
            [
                row({ kind: 'cooked' }),
                row({ kind: 'photo', amount: 1 }),
                row({ kind: 'photo', amount: 1 }),
                row({ kind: 'note', text: 'Halb so viel Chili' }),
            ],
            SITE
        )?.message,
        'Anna: gekocht · 2 Fotos · „Halb so viel Chili“'
    );

    equal(
        'a note given with the cooking counts as its note',
        buildPush([row({ kind: 'cooked', text: 'Lecker' })], SITE)?.message,
        'Anna: gekocht · „Lecker“'
    );

    const several = buildPush(
        [
            row({ amount: 5 }),
            row({ actorName: 'Ben', recipeTitle: 'Ramen', recipeSlug: 'ramen', kind: 'cooked' }),
            row({ kind: 'ticket', recipeTitle: null, recipeSlug: null, text: 'Idee: Eine Suche nach Zutaten' }),
        ],
        SITE
    );
    equal('several become one message', several?.title, '3 neue Aktivitäten im Kochbuch');
    equal(
        'one line each',
        several?.message,
        'Anna · Linsen-Dal: ★★★★★\nBen · Ramen: gekocht\nAnna · Feedback: „Idee: Eine Suche nach Zutaten“'
    );
    equal('mixed recipes open the front page', several?.click, 'https://cook.test/de');

    equal(
        'a ticket alone opens the ticket list',
        buildPush([row({ kind: 'ticket', recipeTitle: null, recipeSlug: null, text: 'Problem: hakt' })], SITE)?.click,
        'https://cook.test/de/admin/tickets'
    );

    const many = buildPush(
        Array.from({ length: 9 }, (_, i) => row({ actorName: `P${i}`, amount: 3 })),
        SITE
    );
    equal('a long run is counted, not listed', many?.message.split('\n').at(-1), '… und 3 weitere');
    equal('the same recipe throughout still opens it', many?.click, 'https://cook.test/de/recipe/linsen-dal');
}
