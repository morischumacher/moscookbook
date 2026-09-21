/** the backup format, in both directions */
import { buildArchive, parseArchive, archiveFilename, ARCHIVE_VERSION, type ExportableRecipe } from '../src/lib/archive';
import { suite, check, equal } from './harness';

function row(overrides: Partial<ExportableRecipe> = {}): ExportableRecipe {
    return {
        title: 'Käsespätzle',
        slug: 'kaesespaetzle',
        description: 'Cremig.',
        instructions: '1. Kochen.',
        category: 'Dinner',
        nationality: 'German',
        servings: 4,
        prepMinutes: 15,
        cookMinutes: 30,
        views: 12,
        createdAt: new Date('2026-02-01T10:00:00Z'),
        images: [{ url: 'https://example.com/a.jpg' }],
        ingredients: [
            { position: 1, quantity: 200, quantityMax: null, unit: 'g', name: 'Bergkäse', raw: '200 g' },
            { position: 0, quantity: 400, quantityMax: null, unit: 'g', name: 'Spätzle', raw: '400 g' },
        ],
        ...overrides,
    };
}

export default function run() {
    suite('buildArchive');

    const archive = buildArchive([row()], new Date('2026-09-20T18:00:00Z'));

    check('carries the format version', archive.version === ARCHIVE_VERSION, archive.version);
    check('records when it was written', archive.exportedAt === '2026-09-20T18:00:00.000Z', archive.exportedAt);
    check('counts the recipes', archive.recipeCount === 1, archive.recipeCount);
    check('keeps the image URLs', archive.recipes[0].images[0] === 'https://example.com/a.jpg');
    check('ingredients come out in order', archive.recipes[0].ingredients[0].name === 'Spätzle', archive.recipes[0].ingredients);
    check('positions are renumbered from zero',
        archive.recipes[0].ingredients.map((i) => i.position).join(',') === '0,1',
        archive.recipes[0].ingredients.map((i) => i.position));

    suite('round trip');

    const back = parseArchive(JSON.parse(JSON.stringify(archive)));
    check('reads back what it wrote', back.ok, back.error);

    // Keys sorted before comparing: what has to survive a round trip is the
    // content, and an object that comes back with its keys in a different
    // order has lost nothing. Comparing the raw strings made this test fail
    // the day the archive grew a field, which is a test failing for being
    // written too tightly rather than for a bug.
    const stable = (value: unknown): string =>
        JSON.stringify(value, (_key, inner) =>
            inner && typeof inner === 'object' && !Array.isArray(inner)
                ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
                : inner
        );

    check('nothing is lost in the round trip', stable(back.archive) === stable(archive), back.error);

    suite('parseArchive refuses what it should');

    check('not an object', !parseArchive('nope').ok);
    check('null', !parseArchive(null).ok);
    check('missing recipes', !parseArchive({ version: 1, exportedAt: 'x' }).ok);
    check('a recipe without a title',
        !parseArchive({ version: 1, exportedAt: 'x', recipes: [{ slug: 'a' }] }).ok);

    const newer = parseArchive({ version: ARCHIVE_VERSION + 1, exportedAt: 'x', recipes: [] });
    check('an archive from a newer version is refused', !newer.ok, newer.error);
    check('and says so understandably', newer.error?.includes('newer version') === true, newer.error);

    const duplicate = parseArchive({
        version: 1,
        exportedAt: 'x',
        recipes: [
            { title: 'A', slug: 'same' },
            { title: 'B', slug: 'same' },
        ],
    });
    check('duplicate slugs are caught before they hit the database', !duplicate.ok, duplicate.error);

    suite('parseArchive is tolerant where it can be');

    const minimal = parseArchive({
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        recipes: [{ title: 'Spiegelei', slug: 'spiegelei' }],
    });
    check('a hand-written minimal archive is accepted', minimal.ok, minimal.error);
    check('missing fields get sensible defaults',
        minimal.archive?.recipes[0].ingredients.length === 0 &&
        minimal.archive?.recipes[0].images.length === 0 &&
        minimal.archive?.recipes[0].views === 0,
        minimal.archive?.recipes[0]);

    suite('archiveFilename');

    check('is dated', archiveFilename(new Date('2026-09-20T18:00:00Z')) === 'moscookbook-2026-09-20.json',
        archiveFilename(new Date('2026-09-20T18:00:00Z')));

    suite('archive — entries and photographs');

    // Version 2 grew two lists. The thing that matters is that version 1 still
    // reads: a restore that refused last month's file because this month's
    // format grew would be the exact failure a backup exists to prevent.
    const old = parseArchive({
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        recipes: [{ title: 'Toast', slug: 'toast', ingredients: [], images: [] }],
    });

    check('a version 1 archive still reads', old.ok, old.error);
    equal('and gets an empty list of entries', old.archive?.posts, []);
    equal('and of photographs', old.archive?.cookPhotos, []);

    const withExtras = buildArchive(
        [],
        new Date('2026-09-21T10:00:00.000Z'),
        [
            {
                title: 'Mit halb so viel Zucker',
                slug: 'halb-so-viel-zucker',
                body: 'Besser.',
                imageUrl: null,
                publishedAt: new Date('2026-09-14T00:00:00.000Z'),
                createdAt: new Date('2026-09-13T00:00:00.000Z'),
                recipe: { slug: 'zwetschgenkuchen' },
                author: { name: 'Moritz Schumacher' },
            },
            {
                title: 'Über Salz',
                slug: 'ueber-salz',
                body: 'Mehr, als man denkt.',
                imageUrl: null,
                publishedAt: null,
                createdAt: new Date('2026-08-02T00:00:00.000Z'),
                recipe: null,
                author: null,
            },
        ],
        [
            {
                url: 'https://blob.test/cooked.jpg',
                caption: 'beim zweiten Versuch',
                createdAt: new Date('2026-09-15T00:00:00.000Z'),
                recipe: { slug: 'zwetschgenkuchen' },
                user: { name: 'Anna' },
            },
        ]
    );

    equal('carries both entries', withExtras.posts.length, 2);
    // By slug, not by id: an archive is restored into a database where every
    // id is new, and a slug is the one name that survives the trip.
    equal('links an entry to its recipe by slug', withExtras.posts[0].recipeSlug, 'zwetschgenkuchen');
    equal('keeps a standalone entry standalone', withExtras.posts[1].recipeSlug, null);
    equal('keeps a draft a draft', withExtras.posts[1].publishedAt, null);
    equal('carries the photograph', withExtras.cookPhotos.length, 1);
    equal('with the recipe it belongs to', withExtras.cookPhotos[0].recipeSlug, 'zwetschgenkuchen');
    equal('and its note', withExtras.cookPhotos[0].caption, 'beim zweiten Versuch');

    const roundTripped = parseArchive(JSON.parse(JSON.stringify(withExtras)));
    check('survives being written out and read back', roundTripped.ok, roundTripped.error);
    equal('with both entries intact', roundTripped.archive?.posts.length, 2);
    equal('and the photograph', roundTripped.archive?.cookPhotos.length, 1);

    // Dates go through JSON as strings and have to come back as the same
    // instant, or a restored entry quietly moves in the list.
    equal(
        'and the entry still says when it was published',
        roundTripped.archive?.posts[0].publishedAt,
        '2026-09-14T00:00:00.000Z'
    );
}

/**
 * Collections and cooking logs survive the round trip.
 *
 * Appended as its own suite rather than folded into the one above, because
 * what it is checking is different: not "does the shape hold" but "did the
 * thing added last month get into the archive" — which is the failure a backup
 * exists to prevent and the one that announces itself only when you need it.
 */
export function archiveCollectionsTests() {
    suite('archive — collections and cooking logs');

    const archive = buildArchive(
        [],
        new Date('2026-09-21T18:00:00Z'),
        [],
        [],
        [
            {
                cookedAt: new Date('2026-09-14T18:00:00Z'),
                note: 'half the chilli',
                recipe: { slug: 'thai-green-curry' },
                user: { name: 'Moritz Schumacher' },
            },
        ],
        [
            {
                title: 'Weihnachten',
                slug: 'weihnachten',
                description: 'Das Menü von 2026',
                createdAt: new Date('2026-09-01T10:00:00Z'),
                recipes: [
                    { recipe: { slug: 'vorspeise' } },
                    { recipe: { slug: 'hauptgang' } },
                    { recipe: { slug: 'nachtisch' } },
                ],
            },
        ]
    );

    equal('the cooking note is carried', archive.cookLogs[0].note, 'half the chilli');
    equal('by recipe slug', archive.cookLogs[0].recipeSlug, 'thai-green-curry');
    equal('and by author name', archive.cookLogs[0].author, 'Moritz Schumacher');

    equal('the collection is carried', archive.collections[0].title, 'Weihnachten');
    equal(
        'and its order, which is the part that took the thinking',
        archive.collections[0].recipeSlugs,
        ['vorspeise', 'hauptgang', 'nachtisch']
    );

    /* ------------------------------------------------------- reading it back */

    const parsed = parseArchive(JSON.parse(JSON.stringify(archive)));

    check('it parses again', parsed.ok, parsed.error);
    equal('with the log intact', parsed.archive?.cookLogs.length, 1);
    equal(
        'and the order intact',
        parsed.archive?.collections[0].recipeSlugs,
        ['vorspeise', 'hauptgang', 'nachtisch']
    );

    /* -------------------------------------------------------- older archives */

    const older = parseArchive({
        version: 2,
        exportedAt: '2026-01-01T00:00:00.000Z',
        recipes: [],
    });

    check('an archive from before any of this still reads', older.ok, older.error);
    equal('with no cooking logs rather than an error', older.archive?.cookLogs, []);
    equal('and no collections', older.archive?.collections, []);
}
