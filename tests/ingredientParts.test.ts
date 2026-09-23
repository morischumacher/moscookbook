/** splitting and rebuilding ingredient amounts */
import { splitAmount, formatAmount, toStructuredIngredients, toDisplayIngredient, sectionHeading, withHeadingRows } from '../src/lib/ingredientParts';
import { suite, check, equal } from './harness';

export default function run() {
    suite('splitAmount');

    const cases: [string, number | null, number | null, string | null][] = [
        // input          quantity  quantityMax  unit
        ['200 g', 200, null, 'g'],
        ['200g', 200, null, 'g'],
        ['1,5 kg', 1.5, null, 'kg'],
        ['1/2 TL', 0.5, null, 'TL'],
        ['½ TL', 0.5, null, 'TL'],
        ['1 1/2 Tassen', 1.5, null, 'Tassen'],
        ['2-3 EL', 2, 3, 'EL'],
        ['2 bis 3 EL', 2, 3, 'EL'],
        ['ca. 100 g', 100, null, 'g'],
        ['3', 3, null, null],
        ['2 cups', 2, null, 'cups'],
        ['1 Pck.', 1, null, 'Pck'],
        ['', null, null, null],
        ['Prise', null, null, 'Prise'],
        ['etwas', null, null, 'etwas'],
        ['nach Geschmack', null, null, 'nach Geschmack'],
    ];

    for (const [input, quantity, quantityMax, unit] of cases) {
        const parts = splitAmount(input);
        check(
            `"${input}" -> ${quantity} / ${quantityMax} / ${unit}`,
            parts.quantity === quantity && parts.quantityMax === quantityMax && parts.unit === unit,
            parts
        );
    }

    suite('formatAmount — scaling is arithmetic now');

    const scaled: [string, number, string][] = [
        ['200 g', 2, '400 g'],
        ['200 g', 0.5, '100 g'],
        ['1 TL', 0.5, '1/2 TL'],
        ['1/2 TL', 3, '1 1/2 TL'],
        ['2-3 EL', 2, '4-6 EL'],
        ['3', 2, '6'],
        ['1,5 kg', 2, '3 kg'],
    ];

    for (const [input, factor, want] of scaled) {
        const got = formatAmount(splitAmount(input), factor);
        check(`"${input}" x${factor} -> "${want}"`, got === want, got);
    }

    suite('amounts without a number are never invented');

    for (const text of ['etwas', 'nach Geschmack', 'Prise', '']) {
        const row = { ...splitAmount(text), name: 'Salz', raw: text };
        check(`"${text}" stays "${text}" when scaled`, toDisplayIngredient(row, 4).amount === text, toDisplayIngredient(row, 4));
    }

    suite('the author wording wins at factor 1');

    const row = { ...splitAmount('200g'), name: 'Mehl', raw: '200g' };
    check('unscaled shows exactly what was typed', toDisplayIngredient(row, 1).amount === '200g', toDisplayIngredient(row, 1));
    check('scaled is rebuilt from the parts', toDisplayIngredient(row, 2).amount === '400 g', toDisplayIngredient(row, 2));

    suite('toStructuredIngredients');

    const rows = toStructuredIngredients([
        { amount: '200 g', item: ' Mehl ' },
        { amount: '', item: 'Salz' },
        { amount: '2 EL', item: '' },
    ]);
    check('drops nameless rows', rows.length === 2, rows);
    check('trims the name', rows[0].name === 'Mehl', rows[0]);
    check('keeps the raw amount', rows[0].raw === '200 g', rows[0]);
    check('structures the amount', rows[0].quantity === 200 && rows[0].unit === 'g', rows[0]);
    check('a nameless quantity is not stored', rows.every((r) => r.name !== ''), rows);
}

export function ingredientSectionTests() {
    suite('ingredients: sections');
    const rows = toStructuredIngredients([
        { amount: '', item: '## Für den Teig' },
        { amount: '500 g', item: 'Mehl' },
        { amount: '1', item: 'Ei' },
        { amount: '', item: 'Für die Füllung:' },
        { amount: '300 g', item: 'Quark' },
        { amount: '', item: '## ' },
    ]);
    equal('headings are not ingredients', rows.map((row) => row.name), ['Mehl', 'Ei', 'Quark']);
    equal('everything below a heading belongs to it', rows.map((row) => row.section), ['Für den Teig', 'Für den Teig', 'Für die Füllung']);
    equal('a recipe without headings has none', toStructuredIngredients([{ amount: '1', item: 'Ei' }])[0].section, null);
    check('an amount makes it an ingredient, colon or not', sectionHeading({ amount: '1', item: 'Salz:' }) === null);

    equal(
        'and back into the editor, with a heading where the section changes',
        withHeadingRows(rows.map((row) => ({ amount: row.raw, item: row.name, section: row.section }))),
        [
            { amount: '', item: '## Für den Teig' },
            { amount: '500 g', item: 'Mehl' },
            { amount: '1', item: 'Ei' },
            { amount: '', item: '## Für die Füllung' },
            { amount: '300 g', item: 'Quark' },
        ]
    );
}

