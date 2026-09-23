/** One way to write a recipe */
import { suite, check, equal } from './harness';
import { newRecipeData, recipeColumns } from '../src/lib/recipeRepo';
import { draftFromJson } from '../src/lib/captureDraft';

const fields = {
    title: 'Käsespätzle',
    slug: 'kaesespaetzle',
    description: 'Cremig.',
    category: 'Dinner',
    nationality: 'German',
    instructions: 'Zwiebeln rösten.',
    servings: 4,
    prepMinutes: undefined,
    cookMinutes: null,
    ingredients: [
        { quantity: 400, quantityMax: null, unit: 'g', name: 'Spätzle', raw: '400 g' },
        { quantity: 200, quantityMax: null, unit: 'g', name: 'Bergkäse', raw: '200 g' },
    ],
};

export default function recipeRepoTests() {
    suite('recipeRepo: every write carries its search columns');

    const columns = recipeColumns(fields);
    check('the title is searchable', columns.searchTitle.length > 0, columns.searchTitle);
    check('and so are the ingredients', /bergk/i.test(columns.searchBody), columns.searchBody);
    equal('an unset time is stored as nothing', columns.prepMinutes, null);

    const data = newRecipeData({ ...fields, imageUrls: ['https://a.example/1.jpg', 'https://a.example/2.jpg'] });
    equal('pictures keep their order', data.images.create.map((image) => image.position), [0, 1]);
    equal('ingredients keep theirs', data.ingredients.create.map((row) => row.name), ['Spätzle', 'Bergkäse']);
    check('draft and public are left to the database default unless given', !('isDraft' in data) && !('isPublic' in data));
    equal('and set when they are', newRecipeData({ ...fields, imageUrls: [], isDraft: true }).isDraft, true);
}

export function storedDraftTests() {
    suite('capture drafts: read back whatever shape they were stored in');

    const old = draftFromJson({ description: 'Nur eine Beschreibung', ingredients: [{ amount: '1', item: 'Ei' }, { amount: '', item: ' ' }] });
    equal('a draft without a title gets an empty one', old?.title, '');
    equal('blank ingredient rows are dropped', old?.ingredients.length, 1);
    equal('missing numbers are nothing', old?.servings, null);

    check('a stored null is no draft', draftFromJson(null) === null);
    check('neither is a list', draftFromJson([1, 2]) === null);
    equal('wrongly typed fields fall back', draftFromJson({ title: 5, servings: 'four' })?.servings, null);
}

