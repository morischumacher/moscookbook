import { suite, check, equal } from './harness';
import {
    guessLanguage,
    inLanguage,
    readTranslation,
    sourceKey,
    translateRecipe,
    translatePrompt,
    type TranslatableRecipe,
} from '../src/lib/recipeTranslation';
import { extractJson, type AiKey } from '../src/lib/aiImport';
import { recipeInputSchema } from '../src/lib/recipeSchema';
import { translationRow } from '../src/lib/recipeRepo';

/**
 * The second language. What matters is that a translation cannot lose an
 * ingredient on the way — nobody proof-reads a list in a language they do not
 * read — and that the reader gets the version in theirs.
 */
const key: AiKey = { provider: 'anthropic', apiKey: 'sk-ant-TEST-0000', model: null };

const curry: TranslatableRecipe = {
    title: 'Green Curry',
    description: 'Quick and fragrant.',
    instructions: '1. Heat the oil.\n\n2. Add the paste and 1 cup coconut milk.',
    ingredients: [
        { amount: '', item: '## Curry' },
        { amount: '2 tbsp', item: 'vegetable oil' },
        { amount: '1 cup', item: 'coconut milk' },
        { amount: '', item: '' },
    ],
};

const answer = {
    title: 'Grünes Curry',
    description: 'Schnell und aromatisch.',
    ingredients: [
        { amount: '', item: 'Curry' },
        { amount: '2 EL', item: 'Pflanzenöl' },
        { amount: '240 ml', item: 'Kokosmilch' },
    ],
    instructions: '1. Das Öl erhitzen.\n\n2. Paste und 240 ml Kokosmilch zugeben.',
};

export default async function recipeTranslationTests() {
    suite('recipeTranslation: language');

    equal('an English method is English', guessLanguage(curry.instructions + ' ' + curry.title), 'en');
    equal('a German one is German', guessLanguage('Die Zwiebel würfeln und mit etwas Öl anbraten.'), 'de');
    equal('nothing at all counts as German', guessLanguage(''), 'de');

    suite('recipeTranslation: the answer');

    const read = readTranslation(answer, curry, 'de', 'k');
    check('a matching answer is taken', read !== null);
    equal('amounts are the translated ones', read?.ingredients.map((row) => row.amount), ['', '2 EL', '240 ml']);
    equal('a heading that lost its "## " is a heading again', read?.ingredients[0].item, '## Curry');
    equal('it remembers what it was made from', read?.source, 'k');
    equal('and which language it is in', read?.locale, 'de');

    check('a lost ingredient is refused',
        readTranslation({ ...answer, ingredients: answer.ingredients.slice(0, 2) }, curry, 'de', 'k') === null);
    check('an empty ingredient is refused',
        readTranslation({ ...answer, ingredients: [...answer.ingredients.slice(0, 2), { amount: '1', item: '' }] }, curry, 'de', 'k') === null);
    check('prose instead of JSON is refused', readTranslation(null, curry, 'de', 'k') === null);
    check('a method that went missing is refused',
        readTranslation({ ...answer, instructions: '' }, curry, 'de', 'k') === null);

    check('the German prompt converts cups', translatePrompt('en', 'de').includes('cups of liquid → ml'));
    check('the English prompt keeps metric', translatePrompt('de', 'en').includes('do not convert to cups'));

    suite('recipeTranslation: fingerprint');

    equal('the same recipe, the same key', sourceKey(curry), sourceKey({ ...curry, title: ' Green Curry ' }));
    check('an edited amount changes it',
        sourceKey(curry) !== sourceKey({ ...curry, ingredients: [{ amount: '3 tbsp', item: 'vegetable oil' }] }));

    suite('recipeTranslation: the call');

    const good = await translateRecipe(curry, 'en', [key], async () => '```json\n' + JSON.stringify(answer) + '\n```', extractJson);
    check('a good answer comes back', good.ok && good.translation.title === 'Grünes Curry', good);
    check('with the source key of what was sent', good.ok && good.translation.source === sourceKey(curry));

    const bad = await translateRecipe(curry, 'en', [key, key], async () => '{"title": "x", "ingredients": []}', extractJson);
    check('an answer that dropped lines is unusable', !bad.ok && bad.reason === 'unusable', bad);

    const failing = await translateRecipe(curry, 'en', [key], async () => { throw new Error('401 sk-ant-TEST-0000'); }, extractJson);
    check('a failure does not carry the key', !failing.ok && !failing.message.includes('sk-ant-TEST-0000'), failing);

    const none = await translateRecipe(curry, 'en', [], async () => '', extractJson);
    check('no key, no call', !none.ok && none.reason === 'no-keys');

    suite('recipeTranslation: the reader');

    const stored = {
        title: 'Green Curry',
        description: 'Quick.',
        instructions: '1. Heat.',
        ingredients: [{ quantity: 2, quantityMax: null, unit: 'tbsp', name: 'oil', raw: '2 tbsp', section: null }],
        language: 'en',
        translations: [{ locale: 'de', title: 'Grünes Curry', description: '', instructions: '1. Erhitzen.', ingredients: [{ amount: '2 EL', item: 'Öl' }] }],
    };

    const german = inLanguage(stored, 'de');
    equal('a German reader gets the German title', german.title, 'Grünes Curry');
    equal('and the German amounts, parsed for scaling', [german.ingredients[0].quantity, german.ingredients[0].unit, german.ingredients[0].name], [2, 'EL', 'Öl']);
    check('and is told it is a translation', german.translated);
    equal('an English reader gets the original', inLanguage(stored, 'en').title, 'Green Curry');
    equal('a recipe with no translation is itself', inLanguage({ ...stored, translations: [] }, 'de').title, 'Green Curry');

    suite('recipeTranslation: saving');

    const base = {
        title: 'Green Curry', slug: 'green-curry', instructions: '1. Heat.',
        ingredients: [{ amount: '2 tbsp', item: 'oil' }],
    };
    const withTranslation = recipeInputSchema.safeParse({ ...base, language: 'en', translation: { locale: 'de', title: 'Grünes Curry', ingredients: [{ amount: '2 EL', item: 'Öl' }] } });
    check('a recipe is accepted with its translation', withTranslation.success, withTranslation.success ? null : withTranslation.error.issues);
    check('null removes it', recipeInputSchema.safeParse({ ...base, translation: null }).success);
    check('an unknown language is refused', !recipeInputSchema.safeParse({ ...base, language: 'fr' }).success);

    const translation = withTranslation.success ? withTranslation.data.translation : null;
    check('a translation into another language is written', translationRow(translation, 'en') !== null);
    check('a "translation" into its own language is not', translationRow(translation, 'de') === null);
}
