/** the backup format, in both directions */
import { buildArchive, parseArchive, archiveFilename, ARCHIVE_VERSION, type ExportableRecipe } from '../src/lib/archive';
import { suite, check } from './harness';

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
    check('nothing is lost in the round trip',
        JSON.stringify(back.archive) === JSON.stringify(archive),
        back.error);

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
}
