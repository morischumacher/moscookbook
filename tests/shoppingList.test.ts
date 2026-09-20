/** merging several recipes into one shopping list */
import { buildShoppingList, type RecipeForList } from '../src/lib/shoppingList';
import { splitAmount } from '../src/lib/ingredientParts';
import { suite, check } from './harness';

function recipe(
    id: number,
    title: string,
    lines: [string, string][],
    servings: number | null = null,
    wantedServings: number | null = null
): RecipeForList {
    return {
        recipeId: id,
        title,
        slug: title.toLowerCase(),
        servings,
        wantedServings,
        ingredients: lines.map(([amount, name]) => ({
            ...splitAmount(amount),
            name,
            raw: amount,
        })),
    };
}

export default function run() {
    suite('buildShoppingList — adding up');

    const list = buildShoppingList([
        recipe(1, 'Kuchen', [['200 g', 'Mehl'], ['2', 'Eier'], ['1 Prise', 'Salz']]),
        recipe(2, 'Brot', [['300 g', 'Mehl'], ['1', 'Ei'], ['Salz', 'Salz']]),
    ]);

    const find = (name: string) => list.find((item) => item.name.toLowerCase().startsWith(name));

    check('flour is summed', find('mehl')?.amount === '500 g', find('mehl'));
    check('flour lists both recipes', find('mehl')?.sources.length === 2, find('mehl')?.sources);
    // Deliberately NOT merged: stemming "Eier" to "Ei" would also turn "Eis"
    // into "Ei". A list that is slightly redundant beats one that is wrong.
    const eggEntries = list.filter((item) => item.name.toLowerCase().startsWith('ei'));
    check('singular and plural stay separate on purpose', eggEntries.length === 2, eggEntries.map((i) => i.name));

    suite('units that cannot be added stay apart');

    const mixed = buildShoppingList([
        recipe(1, 'A', [['2', 'Zwiebeln']]),
        recipe(2, 'B', [['100 g', 'Zwiebeln']]),
    ]);
    check('two entries, not one wrong number', mixed.length === 2, mixed.map((i) => i.amount));

    suite('lines without a quantity are never counted');

    const salt = buildShoppingList([
        recipe(1, 'A', [['', 'Salz']]),
        recipe(2, 'B', [['', 'Salz']]),
        recipe(3, 'C', [['', 'Salz']]),
    ]);
    check('salt appears once', salt.length === 1, salt);
    check('salt has no invented amount', salt[0].amount === '', salt[0]);
    check('salt credits all three recipes', salt[0].sources.length === 3, salt[0].sources);

    const single = buildShoppingList([recipe(1, 'A', [['etwas', 'Öl']])]);
    check('a single source keeps its wording', single[0].amount === 'etwas', single[0]);

    suite('servings scale the shopping list');

    const scaled = buildShoppingList([
        recipe(1, 'Kuchen', [['200 g', 'Mehl']], 4, 8),
    ]);
    check('doubled portions double the amount', scaled[0].amount === '400 g', scaled[0]);

    const halved = buildShoppingList([recipe(1, 'Kuchen', [['200 g', 'Mehl']], 4, 2)]);
    check('halved portions halve the amount', halved[0].amount === '100 g', halved[0]);

    const noServings = buildShoppingList([recipe(1, 'Kuchen', [['200 g', 'Mehl']], null, 8)]);
    check('no base servings means no scaling', noServings[0].amount === '200 g', noServings[0]);

    suite('ranges');

    const ranged = buildShoppingList([
        recipe(1, 'A', [['2-3 EL', 'Öl']]),
        recipe(2, 'B', [['1 EL', 'Öl']]),
    ]);
    check('ranges add on both bounds', ranged[0].amount === '3-4 EL', ranged[0]);

    suite('edge cases');

    check('no recipes gives an empty list', buildShoppingList([]).length === 0);
    check(
        'nameless lines are skipped',
        buildShoppingList([recipe(1, 'A', [['200 g', '   ']])]).length === 0
    );
    const duplicateInOneRecipe = buildShoppingList([
        recipe(1, 'A', [['100 g', 'Butter'], ['50 g', 'Butter']]),
    ]);
    check('the same recipe is only credited once', duplicateInOneRecipe[0].sources.length === 1, duplicateInOneRecipe[0]);
    check('duplicates within a recipe still add up', duplicateInOneRecipe[0].amount === '150 g', duplicateInOneRecipe[0]);
}
