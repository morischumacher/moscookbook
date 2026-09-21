import { suite, equal, check } from './harness';
import { titleTokens, findDuplicate, type ExistingRecipe } from '../src/lib/duplicates';

export default function duplicatesTests() {
    suite('titleTokens');

    equal('folds umlauts so both spellings meet', titleTokens('Käsespätzle'), ['kasespatzle']);
    equal('folds ß', titleTokens('Grießbrei'), ['griessbrei']);
    equal('drops filler words', titleTokens('Der beste Apfelkuchen der Welt'), ['apfelkuchen', 'welt']);
    equal(
        'drops the words every recipe title carries',
        titleTokens('Einfaches Rezept: Original Spaghetti Carbonara'),
        ['spaghetti', 'carbonara']
    );
    equal('drops punctuation', titleTokens('Spaghetti, Aglio e Olio!'), ['spaghetti', 'aglio', 'olio']);
    equal('returns nothing for a title of pure filler', titleTokens('Das beste Rezept'), []);

    suite('findDuplicate');

    const existing: ExistingRecipe[] = [
        { id: 1, title: 'Apfelkuchen', slug: 'apfelkuchen' },
        { id: 2, title: 'Spaghetti Carbonara', slug: 'spaghetti-carbonara' },
        { id: 3, title: 'Käsespätzle', slug: 'kaesespaetzle' },
    ];

    const publishedUrls = new Map<string, ExistingRecipe>([
        ['https://www.youtube.com/watch?v=abcdefghijk', existing[1]],
    ]);

    equal(
        'the same link is a certain duplicate',
        findDuplicate('Ganz anderer Titel', 'https://www.youtube.com/watch?v=abcdefghijk', existing, publishedUrls),
        { id: 2, title: 'Spaghetti Carbonara', slug: 'spaghetti-carbonara', reason: 'link' }
    );

    equal(
        'so is the same title',
        findDuplicate('Apfelkuchen', null, existing, publishedUrls)?.reason,
        'title'
    );

    equal(
        'and the same title spelled without umlauts',
        findDuplicate('Kasespatzle', null, existing, publishedUrls)?.id,
        3
    );

    equal(
        'filler words do not hide a duplicate',
        findDuplicate('Das beste Apfelkuchen Rezept', null, existing, publishedUrls)?.id,
        1
    );

    // The important negative. A longer, more specific title is a different
    // dish, and a warning here would teach you to ignore warnings.
    equal(
        'a more specific dish is not a duplicate',
        findDuplicate('Apfelkuchen mit Streuseln und Vanillesauce', null, existing, publishedUrls),
        null
    );
    equal(
        'nor is an unrelated recipe',
        findDuplicate('Zwiebelsuppe', null, existing, publishedUrls),
        null
    );
    equal(
        'a title of nothing but filler warns about nothing',
        findDuplicate('Das beste Rezept', null, existing, publishedUrls),
        null
    );
    equal(
        'an empty title warns about nothing',
        findDuplicate('', null, existing, publishedUrls),
        null
    );

    check(
        'an unknown link alone does not warn',
        findDuplicate('Zwiebelsuppe', 'https://example.com/neu', existing, publishedUrls) === null,
        true
    );
}
