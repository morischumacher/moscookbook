import { suite, equal, check } from './harness';
import { singular, searchableText, searchFields, buildTsQuery } from '../src/lib/searchText';

/**
 * These pin the shapes this module produces. What those shapes actually match
 * once Postgres has stemmed them is a separate question, answered by
 * `npm run verify:search` against a real database — a regex cannot tell you
 * that `to_tsvector('german', 'Käse')` is `'kas'`.
 */
export default function searchTextTests() {
    suite('singular');

    equal('strips the plural -n', singular('zwiebeln'), 'zwiebel');
    equal('strips -en', singular('tomaten'), 'tomat');
    equal('strips -er', singular('kraeuter'), 'kraeut');
    equal('strips the loanword -s', singular('muffins'), 'muffin');
    equal('leaves a word with no plural ending alone', singular('salz'), null);

    // The whole reason MIN_STEM exists: three-letter stems turn ice cream into
    // eggs, which is how the shopping list learned not to stem at all.
    equal('refuses to turn Eis into Ei', singular('eis'), null);
    equal('refuses to turn Eier into Ei', singular('eier'), null);
    equal('refuses to turn Tee into Te', singular('tee'), null);

    suite('searchableText');

    equal(
        'appends an ae spelling for every word carrying an umlaut',
        searchableText('Käsespätzle'),
        'Käsespätzle kaesespaetzle'
    );
    equal('expands ß to ss', searchableText('Grießbrei'), 'Grießbrei griessbrei');
    equal(
        'leaves text without umlauts untouched',
        searchableText('Green Curry'),
        'Green Curry'
    );
    equal(
        'joins the parts it is given and collapses whitespace',
        searchableText('Suppe', null, '  aus   Zwiebeln ', undefined),
        'Suppe aus Zwiebeln'
    );
    equal(
        'adds each umlaut word once, however often it appears',
        searchableText('Käse mit Käse und Käse'),
        'Käse mit Käse und Käse kaese'
    );

    suite('searchFields');

    const fields = searchFields({
        title: 'Käsespätzle',
        description: 'Schwäbisch',
        instructions: 'Zwiebeln rösten',
        ingredients: ['Bergkäse', 'Zwiebeln'],
    });

    equal('keeps the title in its own column', fields.searchTitle, 'Käsespätzle kaesespaetzle');
    check(
        'puts ingredients in the body',
        fields.searchBody.includes('Bergkäse') && fields.searchBody.includes('bergkaese'),
        fields.searchBody
    );
    check(
        'keeps the title out of the body, so weighting stays meaningful',
        !fields.searchBody.includes('Käsespätzle'),
        fields.searchBody
    );

    equal(
        'survives a recipe with nothing but a title',
        searchFields({ title: 'Toast' }),
        { searchTitle: 'Toast', searchBody: '' }
    );

    suite('buildTsQuery');

    equal('searches a single word as a prefix', buildTsQuery('curry'), 'curry:*');
    equal(
        'offers the de-pluralised form alongside the word itself',
        buildTsQuery('Zwiebeln'),
        '(zwiebeln:* | zwiebel:*)'
    );
    equal(
        'offers the ae spelling alongside the umlaut',
        buildTsQuery('Käse'),
        '(käse:* | kaese:*)'
    );
    equal(
        'combines both expansions',
        buildTsQuery('Brühen'),
        '(brühen:* | bruehen:* | brüh:* | brueh:*)'
    );
    equal(
        'ANDs several words, so more words narrow',
        buildTsQuery('zwiebel suppe'),
        'zwiebel:* & (suppe:* | supp:*)'
    );
    equal(
        'ignores punctuation between words',
        buildTsQuery('Käse, Spätzle!'),
        '(käse:* | kaese:*) & (spätzle:* | spaetzle:* | spätzl:* | spaetzl:*)'
    );
    equal(
        'drops single characters but keeps short words',
        buildTsQuery('3 Minuten Ei'),
        '(minuten:* | minut:*) & ei:*'
    );
    // The expansion must not lengthen a word past the stemming guard.
    equal('does not let the ae spelling sneak past MIN_STEM', buildTsQuery('Käse'), '(käse:* | kaese:*)');
    equal('returns null when nothing usable was typed', buildTsQuery('   '), null);
    equal('returns null for punctuation only', buildTsQuery('!!! ???'), null);

    // Anything that could carry tsquery syntax has to be gone by now: the
    // string is handed to to_tsquery, which parses it.
    const hostile = buildTsQuery("Käse & (Spätzle | ':*') <-> ! ; drop table");
    check(
        'strips every tsquery operator out of what the visitor typed',
        hostile !== null && !/[&|!<>'();]/.test(hostile.replace(/ [&|] /g, ' ').replace(/[()]/g, '')),
        hostile
    );
}
