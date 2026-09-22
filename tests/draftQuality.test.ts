import { suite, check, equal } from './harness';
import { assessDraft, worthAsking } from '../src/lib/draftQuality';
import type { ImportedRecipe } from '../src/lib/recipeFromHtml';

/**
 * The test that decides whether a model gets asked — and therefore the test
 * that decides what an import costs.
 *
 * Two failures are possible and they are not symmetrical. Marking a good draft
 * as damaged spends money re-reading a page that was read perfectly, every
 * time, forever. Marking a damaged draft as good puts "Cook Mode / Servings /
 * Print Recipe" in the inbox labelled ready, where somebody publishes it and
 * finds out at the stove.
 *
 * The second is worse once. The first is worse continuously. So the cases
 * below lean on the real short recipes as hard as on the rubbish: the first
 * version of this scoring called a two-ingredient tomato soup unpublishable,
 * and it took ten failing tests to notice, because it was reasoning about what
 * a good recipe looks like rather than about what a broken one looks like.
 */

function draft(over: Partial<ImportedRecipe>): ImportedRecipe {
    return {
        title: 'Ofengemüse mit Feta',
        description: '',
        ingredients: [
            { amount: '1', item: 'Zucchini' },
            { amount: '200 g', item: 'Feta' },
            { amount: '2 EL', item: 'Olivenöl' },
        ],
        instructions: 'Gemüse schneiden, mit Öl mischen und 25 Minuten backen.',
        imageUrl: '',
        category: '',
        nationality: '',
        servings: null,
        prepMinutes: null,
        cookMinutes: null,
        sourceUrl: '',
        ...over,
    };
}

export default function draftQualityTests() {
    suite('draftQuality: what must stay good');

    equal('a clean draft is good', assessDraft(draft({})).quality, 'good');
    check('and is not worth asking about', !worthAsking(assessDraft(draft({}))));

    // The case that broke the first version of this file.
    equal(
        'a two-ingredient soup with a one-line method is good',
        assessDraft(
            draft({
                title: 'Tomatensuppe',
                ingredients: [
                    { amount: '500 g', item: 'Tomaten' },
                    { amount: '1 EL', item: 'Öl' },
                ],
                instructions: 'Alles pürieren und erhitzen.',
            })
        ).quality,
        'good'
    );

    equal(
        'salt and pepper with no quantities are not a problem',
        assessDraft(
            draft({
                ingredients: [
                    { amount: '', item: 'Salz' },
                    { amount: '', item: 'Pfeffer' },
                ],
            })
        ).quality,
        'good'
    );

    equal(
        'a method written as one long paragraph is still good',
        assessDraft(
            draft({
                instructions:
                    'Zuerst die Zwiebel würfeln und in Öl anschwitzen, dann die Tomaten zugeben und alles zusammen etwa zwanzig Minuten köcheln lassen, bevor man es püriert und abschmeckt.',
            })
        ).quality,
        'good'
    );

    suite('draftQuality: what must be caught');

    // The exact draft that started this: a page whose markup the parser half
    // understood, producing three fields that are all buttons.
    const rubble = assessDraft(
        draft({
            title: 'Cook Mode',
            ingredients: [{ amount: '', item: 'Servings' }],
            instructions: 'Print Recipe',
        })
    );
    equal('a draft made of page furniture is poor', rubble.quality, 'poor');
    check('and it is worth asking about', worthAsking(rubble));

    equal(
        'a missing title is poor',
        assessDraft(draft({ title: '' })).quality,
        'poor'
    );
    equal(
        'a title that is a link is poor',
        assessDraft(draft({ title: 'https://kochblog.example/rezept/42' })).quality,
        'poor'
    );
    equal(
        'a title that is a heading is poor',
        assessDraft(draft({ title: 'Zutaten' })).quality,
        'poor'
    );
    equal(
        'no ingredients is poor',
        assessDraft(draft({ ingredients: [] })).quality,
        'poor'
    );
    equal(
        'no method is poor',
        assessDraft(draft({ instructions: '' })).quality,
        'poor'
    );
    equal(
        'a method that is a button is poor',
        assessDraft(draft({ instructions: 'Rezept drucken' })).quality,
        'poor'
    );
    equal(
        'a method that is a label is thin',
        assessDraft(draft({ instructions: 'Mehr' })).quality,
        'thin'
    );

    // Four ingredients and not a number among them: this is a paragraph that
    // mentioned food, not an ingredient list.
    equal(
        'four ingredients with no quantity at all is poor',
        assessDraft(
            draft({
                ingredients: [
                    { amount: '', item: 'Zucchini' },
                    { amount: '', item: 'Feta' },
                    { amount: '', item: 'Olivenöl' },
                    { amount: '', item: 'Oregano' },
                ],
            })
        ).quality,
        'poor'
    );

    const mixed = assessDraft(
        draft({
            ingredients: [
                { amount: '1', item: 'Zucchini' },
                { amount: '200 g', item: 'Feta' },
                { amount: '2 EL', item: 'Olivenöl' },
                { amount: '', item: 'Servings' },
            ],
        })
    );
    equal('one stray button among good ingredients is thin', mixed.quality, 'thin');
    check(
        'and the report names it',
        mixed.problems.some((problem) => problem.includes('furniture')),
        mixed.problems
    );

    suite('draftQuality: the furniture list does not eat food');

    // "Portionen" alone is a label; "Portionen Feta" is somebody's shopping.
    equal(
        'an ingredient that merely contains a label word is kept',
        assessDraft(
            draft({
                ingredients: [
                    { amount: '2', item: 'Portionen Feta' },
                    { amount: '1', item: 'Zucchini' },
                    { amount: '2 EL', item: 'Öl' },
                ],
            })
        ).quality,
        'good'
    );

    equal(
        'and a dish named after a cut of meat is not a heading',
        assessDraft(draft({ title: 'Rezept meiner Oma' })).quality,
        'good'
    );
}
