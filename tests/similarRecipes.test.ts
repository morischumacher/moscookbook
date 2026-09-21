import { suite, equal, check } from './harness';
import { similarityQuery } from '../src/lib/similarity';

/**
 * The query behind "recipes like this one".
 *
 * The database part was checked against a real Postgres; this covers the part
 * that turns a recipe's own words into something `to_tsquery` will accept. A
 * stray character there is not a wrong answer, it is a syntax error — and the
 * text it is built from is text a person typed into a recipe form.
 */
export default function similarRecipesTests() {
    suite('recipes like this one');

    equal(
        'words are ORed, because ANDing them would match nothing',
        similarityQuery('thai green curry'),
        'thai | green | curry'
    );

    // Two letters and under is noise in both languages this site speaks.
    equal('short words are dropped', similarityQuery('ei in ml zu salz'), 'salz');

    equal('a word is only used once', similarityQuery('curry curry huhn'), 'curry | huhn');

    equal(
        'punctuation cannot reach to_tsquery',
        similarityQuery("crème fraîche & 500g: zwiebeln!"),
        'crème | fraîche | 500g | zwiebeln'
    );

    check(
        'the characters to_tsquery treats as operators are gone',
        !/[&|!():*<>]/.test(similarityQuery('a & b ! c (d) e:*')?.replace(/ \| /g, ' ') ?? ''),
        'anything left would be an expression rather than a word'
    );

    equal('nothing worth querying', similarityQuery('a in zu'), null);
    equal('an empty recipe', similarityQuery(''), null);
    equal('only punctuation', similarityQuery('--- &&& !!!'), null);

    const long = similarityQuery(
        Array.from({ length: 100 }, (_, index) => `wort${index}`).join(' '),
        24
    );
    equal('a very long recipe is capped', long?.split(' | ').length ?? 0, 24);

    equal('case does not matter', similarityQuery('Curry CURRY cUrRy'), 'curry');
}
