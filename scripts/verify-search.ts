/**
 * Checks the German search against a real Postgres.
 *
 *   createdb searchtest
 *   VERIFY_SEARCH_URL=postgres://localhost/searchtest npm run verify:search
 *
 * The unit tests pin the *shapes* this code produces; only a database can say
 * what those shapes actually match. Every claim in src/lib/searchText.ts was
 * measured here — that the German stemmer folds "Käse" to 'kas' but leaves
 * "Zwiebeln" unreduced, and that "Kaese" needs the indexed ae spelling.
 *
 * This is not part of `npm test`: it needs a throwaway database, and it drops
 * and recreates its own table in whatever database you point it at.
 */
import { execFileSync } from 'child_process';
import { searchableText, buildTsQuery } from '../src/lib/searchText';

const url = process.env.VERIFY_SEARCH_URL;

if (!url) {
    console.error(
        'VERIFY_SEARCH_URL is not set.\n' +
        'Point it at a throwaway database — this script drops and recreates a table:\n' +
        '  VERIFY_SEARCH_URL=postgres://localhost/searchtest npm run verify:search'
    );
    process.exit(1);
}

const PSQL = [url, '-tA'];

function sql(query: string): string {
    return execFileSync('psql', [...PSQL, '-c', query], { encoding: 'utf8' }).trim();
}

function quote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

interface Recipe {
    title: string;
    description: string;
    ingredients: string[];
    instructions: string;
}

const recipes: Recipe[] = [
    {
        title: 'Käsespätzle',
        description: 'Schwäbische Spätzle mit würzigem Bergkäse und Röstzwiebeln.',
        ingredients: ['400 g Spätzle', '200 g Bergkäse', '2 Zwiebeln', 'Salz', 'Muskatnuss'],
        instructions: 'Zwiebeln in Butter goldbraun rösten. Spätzle schichten.',
    },
    {
        title: 'Zwiebelsuppe',
        description: 'Französische Suppe aus langsam geschmorten Zwiebeln.',
        ingredients: ['1 kg Zwiebel', '50 g Butter', '1 l Rinderbrühe', 'Weißbrot'],
        instructions: 'Die Zwiebel in feine Ringe schneiden und sehr langsam schmoren.',
    },
    {
        // Eggs but deliberately no ice cream, so that stemming "Eis" down to
        // "Ei" would produce a visibly wrong result instead of the same one.
        title: 'Grießbrei',
        description: 'Süßer Grießbrei, warm serviert.',
        ingredients: ['500 ml Milch', '80 g Grieß', '2 Eier'],
        instructions: 'Milch aufkochen, Grieß einrühren, Eier unterziehen.',
    },
    {
        // Ice cream but deliberately no eggs.
        title: 'Vanilleeis',
        description: 'Cremiges Eis mit echter Vanille.',
        ingredients: ['500 ml Sahne', '1 Vanilleschote', '100 g Zucker'],
        instructions: 'Sahne mit der Vanille erwärmen und gefrieren lassen.',
    },
    {
        title: 'Green Curry',
        description: 'A fragrant Thai green curry with coconut milk and basil.',
        ingredients: ['400 ml coconut milk', '2 tbsp green curry paste', 'Thai basil'],
        instructions: 'Heat the oil in a wok over medium heat.',
    },
];

sql('drop table if exists recipe');
sql(`create table recipe (
    id serial primary key,
    title text not null,
    "searchTitle" text not null default '',
    "searchBody" text not null default '',
    "searchVector" tsvector generated always as (
        setweight(to_tsvector('german', coalesce("searchTitle", '')), 'A') ||
        setweight(to_tsvector('german', coalesce("searchBody", '')), 'B')
    ) stored
)`);
sql('create index recipe_search_idx on recipe using gin ("searchVector")');

for (const recipe of recipes) {
    const searchTitle = searchableText(recipe.title);
    const searchBody = searchableText(
        recipe.description,
        recipe.ingredients.join(' '),
        recipe.instructions
    );
    sql(
        `insert into recipe (title, "searchTitle", "searchBody") values (${quote(recipe.title)}, ${quote(searchTitle)}, ${quote(searchBody)})`
    );
}

function search(term: string): string[] {
    const tsquery = buildTsQuery(term);
    if (tsquery === null) return [];
    const rows = sql(
        `select title from recipe
         where "searchVector" @@ to_tsquery('german', ${quote(tsquery)})
         order by ts_rank("searchVector", to_tsquery('german', ${quote(tsquery)})) desc, id desc`
    );
    return rows === '' ? [] : rows.split('\n');
}

interface Case {
    term: string;
    expect: string[];
    why: string;
}

const cases: Case[] = [
    { term: 'Käsespätzle', expect: ['Käsespätzle'], why: 'exact, with umlauts' },
    { term: 'Kasespatzle', expect: ['Käsespätzle'], why: 'umlauts dropped — the stemmer folds these' },
    { term: 'Kaesespaetzle', expect: ['Käsespätzle'], why: 'ae spelling — needs the indexed expansion' },
    { term: 'käse', expect: ['Käsespätzle'], why: 'prefix of a compound word' },
    { term: 'kaese', expect: ['Käsespätzle'], why: 'ae spelling, prefix' },
    { term: 'Zwiebel', expect: ['Zwiebelsuppe', 'Käsespätzle'], why: 'singular must find the plural' },
    { term: 'Zwiebeln', expect: ['Zwiebelsuppe', 'Käsespätzle'], why: 'plural must find the singular' },
    { term: 'zwiebel suppe', expect: ['Zwiebelsuppe'], why: 'two words narrow the result' },
    { term: 'Eis', expect: ['Vanilleeis'], why: 'must NOT be stemmed to Ei — eggs must not surface' },
    { term: 'Eier', expect: ['Grießbrei'], why: 'and eggs must not drag in the ice cream' },
    { term: 'Bergkäse', expect: ['Käsespätzle'], why: 'ingredient only, not in the title' },
    { term: 'curry', expect: ['Green Curry'], why: 'English still works' },
    { term: 'Griessbrei', expect: ['Grießbrei'], why: 'ss spelling for ß' },
    { term: 'Schokolade', expect: [], why: 'no match is a clean no match' },
];

let failures = 0;

for (const testCase of cases) {
    const got = search(testCase.term);
    const ok =
        got.length === testCase.expect.length &&
        got.every((title, index) => title === testCase.expect[index]);
    if (!ok) failures += 1;
    console.log(
        `${ok ? 'ok  ' : 'FAIL'}  ${testCase.term.padEnd(16)} → ${JSON.stringify(got).padEnd(46)} ${ok ? '' : `expected ${JSON.stringify(testCase.expect)}`}  (${testCase.why})`
    );
}

console.log(failures === 0 ? '\nall cases pass' : `\n${failures} cases failed`);
process.exitCode = failures === 0 ? 0 : 1;
