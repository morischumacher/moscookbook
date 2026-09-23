/** Moving in from other apps: Paprika, Mealie, Tandoor, Cooklang */
import { gzipSync, strToU8, zipSync } from 'fflate';
import { suite, check, equal } from './harness';
import { fromCooklang, minutesFrom, readForeignFile } from '../src/lib/foreignImport';

export default function foreignImportTests() {
    suite('import: times however they are written');
    equal('"15 min"', minutesFrom('15 min'), 15);
    equal('"1 hr 30 mins"', minutesFrom('1 hr 30 mins'), 90);
    equal('"1 Std. 20 Min."', minutesFrom('1 Std. 20 Min.'), 80);
    equal('ISO', minutesFrom('PT1H5M'), 65);
    equal('a number', minutesFrom(45), 45);
    equal('nothing', minutesFrom(''), null);

    suite('import: a Paprika export');
    const paprika = {
        name: 'Zwetschgenkuchen',
        ingredients: '500 g Zwetschgen\n250 g Mehl\n1 Ei',
        directions: 'Teig kneten.\n\nBelegen und 40 Minuten backen.',
        servings: '12 Stück',
        prep_time: '30 min',
        cook_time: '40 min',
        categories: ['Kuchen', 'Herbst'],
        source_url: 'https://example.com/kuchen',
        photo_data: Buffer.from('not really a jpeg').toString('base64'),
        notes: 'Mit Sahne.',
    };
    const archive = zipSync({ 'Zwetschgenkuchen.paprikarecipe': gzipSync(strToU8(JSON.stringify(paprika))) });
    const [kuchen] = readForeignFile('Export.paprikarecipes', archive);
    equal('the title', kuchen?.title, 'Zwetschgenkuchen');
    equal('the ingredients, split into amount and name', kuchen?.ingredients[0], { amount: '500 g', item: 'Zwetschgen' });
    equal('the servings', kuchen?.servings, 12);
    equal('the times', [kuchen?.prepMinutes, kuchen?.cookMinutes], [30, 40]);
    equal('categories become tags', kuchen?.tags, ['kuchen', 'herbst']);
    check('the notes follow the method', /Mit Sahne/.test(kuchen?.instructions ?? ''));
    check('the photo comes along', (kuchen?.image?.data.length ?? 0) > 0);

    suite('import: a Mealie export');
    const mealie = zipSync({
        'recipes/linsen/linsen.json': strToU8(
            JSON.stringify({
                name: 'Linsensuppe',
                recipeYield: '4 servings',
                prepTime: 'PT10M',
                recipeIngredient: [
                    { quantity: 250, unit: { name: 'g' }, food: { name: 'Linsen' }, note: 'rot' },
                    { originalText: '1 Zwiebel' },
                ],
                recipeInstructions: [{ text: 'Zwiebel anschwitzen.' }, { text: 'Linsen 20 Minuten kochen.' }],
                tags: [{ name: 'Vegan' }],
            })
        ),
        'recipes/linsen/images/original.webp': new Uint8Array([1, 2, 3]),
    });
    const [soup] = readForeignFile('mealie.zip', mealie);
    equal('structured ingredients', soup?.ingredients, [{ amount: '250 g', item: 'Linsen, rot' }, { amount: '1', item: 'Zwiebel' }]);
    equal('numbered steps', soup?.instructions, '1. Zwiebel anschwitzen.\n2. Linsen 20 Minuten kochen.');
    equal('the diet tag in its own key', soup?.tags, ['vegan']);
    equal('the picture beside it', soup?.image?.type, 'image/webp');

    suite('import: a Tandoor export');
    const inner = zipSync({
        'recipe.json': strToU8(
            JSON.stringify({
                name: 'Pfannkuchen',
                servings: 2,
                working_time: 10,
                steps: [
                    {
                        instruction: 'Alles verrühren.',
                        ingredients: [
                            { is_header: true, note: 'Teig' },
                            { food: { name: 'Mehl' }, unit: { name: 'g' }, amount: 125 },
                        ],
                    },
                ],
            })
        ),
    });
    const [pancakes] = readForeignFile('tandoor.zip', zipSync({ '1.zip': inner }));
    equal('with its sections', pancakes?.ingredients, [{ amount: '', item: '## Teig' }, { amount: '125 g', item: 'Mehl' }]);

    suite('import: Cooklang');
    const cook = fromCooklang(
        '>> servings: 2\n>> tags: schnell, pasta\n\nKoche @Spaghetti{200%g} in einem #Topf{} für ~{10%Minuten}.\n\nMit @Salz und @frischem Basilikum{1%Bund} servieren. -- ein Kommentar',
        'spaghetti-al-basilico.cook'
    );
    equal('the title from the file name', cook?.title, 'spaghetti al basilico');
    equal('the ingredients where they are used', cook?.ingredients, [
        { amount: '200 g', item: 'Spaghetti' },
        { amount: '', item: 'Salz' },
        { amount: '1 Bund', item: 'frischem Basilikum' },
    ]);
    equal('the method without the markup', cook?.instructions, '1. Koche Spaghetti in einem Topf für 10 Minuten.\n2. Mit Salz und frischem Basilikum servieren.');
    equal('the metadata', [cook?.servings, cook?.tags], [2, ['schnell', 'pasta']]);

    suite('import: not a recipe file');
    equal('nothing from nothing', readForeignFile('photo.zip', zipSync({ 'a.txt': strToU8('hi') })), []);
    equal('nor from something that is not a zip', readForeignFile('x.zip', strToU8('garbage')), []);
}
