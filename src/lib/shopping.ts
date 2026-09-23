import { splitAmount, formatAmount, type AmountParts } from './ingredientParts';
import { singular, expandUmlauts } from './searchText';
import { fromBase, toBase, type Measured } from './units';

/**
 * The shopping list's thinking, apart from its storage.
 *
 * Three recipes each with onions make one line, "5 Zwiebeln — for Gulasch,
 * Suppe, Salat", not three. For that two lines have to be recognised as the
 * same thing (`shoppingKey`) measured the same way (`toBase` in lib/units:
 * grams with kilos and cups of flour, spoons with spoons, cloves with
 * cloves), and then added. Two amounts that cannot be added — "2 Dosen
 * Tomaten" and "400 g Tomaten" — stay two lines, which is what a shopper
 * needs to see anyway.
 *
 * Lines are grouped by where they are in a shop (`aisleOf`), a small rule
 * table rather than anything clever: a shopper walks the shop once, and the
 * list should follow them round it.
 */

export type Aisle =
    | 'produce'
    | 'dairy'
    | 'meat'
    | 'bakery'
    | 'pantry'
    | 'spices'
    | 'frozen'
    | 'drinks'
    | 'basics'
    | 'other';

/** In the order a shop is usually walked. */
export const AISLES: Aisle[] = ['produce', 'bakery', 'meat', 'dairy', 'pantry', 'spices', 'frozen', 'drinks', 'other', 'basics'];

const AISLE_RULES: Array<[Aisle, RegExp]> = [
    // Things almost every kitchen has. They are still listed — at the end,
    // under their own heading — so nobody is caught out, but they do not
    // clutter the part of the list that is actually shopping.
    ['basics', /^(salz|pfeffer|salt|pepper|black pepper|schwarzer pfeffer|öl|oil|olivenöl|olive oil|zucker|sugar)$/i],
    ['frozen', /tiefkühl|tiefgekühlt|frozen|tk-|erbsen tk/i],
    ['spices', /paprikapulver|pulver|gewürz|zimt|cinnamon|kreuzkümmel|cumin|kurkuma|turmeric|curry(paste|pulver)?\b|chili(flocken|pulver)|oregano|thymian getrocknet|muskat|nutmeg|lorbeer|bay lea|vanille|vanilla|paprika edelsüß|garam masala|brühe|bouillon|stock cube|hefe|yeast|backpulver|baking (powder|soda)|natron/i],
    ['meat', /fleisch|hähnchen|huhn|chicken|rind|beef|schwein|pork|hack|mince|speck|bacon|schinken|ham|wurst|sausage|lamm|lamb|pute|turkey|fisch|fish|lachs|salmon|thunfisch|tuna|garnelen|shrimp|prawn/i],
    ['dairy', /milch|milk|sahne|cream|butter|joghurt|yogurt|yoghurt|quark|käse|cheese|parmesan|mozzarella|feta|ricotta|mascarpone|schmand|crème|creme fraiche|ei\b|eier|egg/i],
    ['bakery', /brot|bread|brötchen|roll|baguette|toast|tortilla|wrap|pita|blätterteig|puff pastry|pizzateig/i],
    ['drinks', /wein|wine|bier|beer|saft|juice|sprudel|mineralwasser|sparkling/i],
    ['produce', /zwiebel|onion|knoblauch|garlic|tomate|tomato|kartoffel|potato|karotte|möhre|carrot|paprika|pepper|zucchini|courgette|aubergine|eggplant|gurke|cucumber|salat|lettuce|spinat|spinach|kohl|cabbage|brokkoli|broccoli|blumenkohl|cauliflower|lauch|leek|sellerie|celery|pilz|champignon|mushroom|ingwer|ginger|chili|zitrone|lemon|limette|lime|apfel|apple|banane|banana|beere|berr|orange|birne|pear|kürbis|pumpkin|squash|avocado|mais|corn|bohne|bean|erbse|pea|kräuter|herb|petersilie|parsley|basilikum|basil|koriander|cilantro|coriander|schnittlauch|chives|dill|minze|mint|rosmarin|rosemary|thymian|thyme|frühlingszwiebel|spring onion|scallion|rucola|rocket|obst|fruit|gemüse|vegetable/i],
    ['pantry', /mehl|flour|zucker|sugar|reis|rice|nudel|pasta|spaghetti|penne|spätzle|spaetzle|gnocchi|tortellini|ravioli|lasagne|linsen|lentil|kichererbse|chickpea|dose|can|konserve|passata|tomatenmark|tomato paste|öl|oil|essig|vinegar|sojasauce|soy sauce|senf|mustard|honig|honey|nüsse|nuts|mandel|almond|haferflocken|oats|schokolade|chocolate|kakao|cocoa|kokosmilch|coconut milk|brühe|stock|sirup|syrup|couscous|bulgur|quinoa|polenta|grieß|semolina/i],
];

export function aisleOf(name: string): Aisle {
    const plain = name.trim().toLowerCase();
    for (const [aisle, pattern] of AISLE_RULES) if (pattern.test(plain)) return aisle;
    return 'other';
}

/** Ingredients nobody buys. */
const NEVER_BOUGHT = /^(wasser|water|warmes wasser|kaltes wasser|lauwarmes wasser|cold water|warm water|hot water|eiswasser|ice water)$/i;

/**
 * What two lines are compared on: "Zwiebeln, fein gehackt" and "Zwiebel"
 * are the same shopping. The preparation after a comma and anything in
 * brackets go; the last word is folded to its singular.
 */
export function shoppingKey(name: string): string {
    const words = name
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .split(/[,;]/)[0]
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return '';
    const last = words[words.length - 1];
    words[words.length - 1] = singular(last) ?? singular(expandUmlauts(last)) ?? last;
    return words.join(' ');
}

/** The name as a line shows it: without the preparation. */
export function shoppingName(name: string): string {
    return name.replace(/\([^)]*\)/g, '').split(/[,;]/)[0].replace(/\s+/g, ' ').trim();
}

export interface IngredientForList {
    name: string;
    quantity: number | null;
    quantityMax: number | null;
    unit: string | null;
}

export interface PlannedLine {
    name: string;
    key: string;
    measure: string | null;
    amount: number | null;
    aisle: Aisle;
    source: string | null;
}

/** A recipe's ingredients at `factor` times their amounts, as list lines. */
export function linesFor(ingredients: IngredientForList[], factor: number, source: string | null): PlannedLine[] {
    return ingredients.flatMap((ingredient) => {
        const name = shoppingName(ingredient.name);
        if (!name || NEVER_BOUGHT.test(name)) return [];

        const scaled: AmountParts = {
            quantity: ingredient.quantity === null ? null : ingredient.quantity * factor,
            quantityMax: ingredient.quantityMax === null ? null : ingredient.quantityMax * factor,
            unit: ingredient.unit,
        };
        const measured = toBase(scaled, name);

        return [
            {
                name,
                key: shoppingKey(name),
                measure: measured?.key ?? null,
                amount: measured?.amount ?? null,
                aisle: aisleOf(name),
                source,
            },
        ];
    });
}

/** A line typed by hand: "2 Zitronen", "500 g Mehl", "Klopapier". */
export function lineFromText(text: string): PlannedLine | null {
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return null;

    const match = /^(\S*\d\S*(?:\s*(?:-|–|bis)\s*\S*\d\S*)?)\s+(\S+)\s+(.+)$/.exec(trimmed);
    // "500 g Mehl": number, unit, name. "2 Zitronen": number, name.
    let parts: AmountParts = { quantity: null, quantityMax: null, unit: null };
    let name = trimmed;

    if (match) {
        const withUnit = splitAmount(`${match[1]} ${match[2]}`);
        if (withUnit.quantity !== null && withUnit.unit && withUnit.unit.length <= 12 && /^[\p{L}.]+$/u.test(withUnit.unit)) {
            parts = withUnit;
            name = match[3];
        }
    }
    if (parts.quantity === null) {
        const lead = /^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(trimmed);
        if (lead) {
            parts = splitAmount(lead[1]);
            name = lead[2];
        }
    }

    return linesFor([{ name, ...parts }], 1, null)[0] ?? null;
}

export interface ExistingLine {
    id: number;
    key: string;
    measure: string | null;
    amount: number | null;
    sources: string[];
    checked: boolean;
}

export interface MergePlan {
    creates: (PlannedLine & { sources: string[] })[];
    updates: { id: number; amount: number | null; sources: string[] }[];
}

/**
 * How new lines join a list: onto an open line for the same thing measured
 * the same way, or as new lines. A line already ticked off is not added to —
 * what was bought was bought, and the extra is a new thing to buy.
 */
export function mergeInto(existing: ExistingLine[], planned: PlannedLine[]): MergePlan {
    const open = new Map<string, { id: number; amount: number | null; sources: string[] }>();
    for (const line of existing) {
        if (!line.checked) open.set(`${line.key}\u0000${line.measure ?? ''}`, { id: line.id, amount: line.amount, sources: line.sources });
    }

    const created = new Map<string, PlannedLine & { sources: string[] }>();
    const touched = new Map<number, { id: number; amount: number | null; sources: string[] }>();

    const add = (amount: number | null, extra: number | null) =>
        amount === null && extra === null ? null : (amount ?? 0) + (extra ?? 0);
    const withSource = (sources: string[], source: string | null) =>
        source && !sources.includes(source) ? [...sources, source] : sources;

    for (const line of planned) {
        const id = `${line.key}\u0000${line.measure ?? ''}`;
        const target = touched.get(open.get(id)?.id ?? -1) ?? open.get(id);

        if (target) {
            const next = { id: target.id, amount: add(target.amount, line.amount), sources: withSource(target.sources, line.source) };
            touched.set(target.id, next);
            open.set(id, next);
            continue;
        }

        const pending = created.get(id);
        if (pending) {
            pending.amount = add(pending.amount, line.amount);
            pending.sources = withSource(pending.sources, line.source);
            continue;
        }

        created.set(id, { ...line, sources: line.source ? [line.source] : [] });
    }

    return { creates: [...created.values()], updates: [...touched.values()] };
}

/** "700 g", "2 EL", "3 Zehen", "3", or "" for a line with no amount. */
export function amountLabel(measure: string | null, amount: number | null, locale: 'en' | 'de'): string {
    if (measure === null || amount === null) return '';
    const parts = fromBase({ key: measure, amount } as Measured, locale);

    // Weights and volumes as decimals — "1,5 kg", not "1 1/2 kg", which is
    // how a scale and a jug are read. Spoons and pieces keep their fractions.
    if ((measure === 'mass' || measure === 'volume') && parts.quantity !== null) {
        const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(parts.quantity);
        return `${number} ${parts.unit ?? ''}`.trim();
    }
    return formatAmount(parts);
}

/** The whole list as text, for sending: grouped, ticked lines left out. */
export function listAsText(
    lines: { name: string; measure: string | null; amount: number | null; aisle: string; checked: boolean }[],
    aisleName: (aisle: Aisle) => string,
    locale: 'en' | 'de'
): string {
    return AISLES.flatMap((aisle) => {
        const here = lines.filter((line) => line.aisle === aisle && !line.checked);
        if (here.length === 0) return [];
        return [
            aisleName(aisle),
            ...here.map((line) => `- ${[amountLabel(line.measure, line.amount, locale), line.name].filter(Boolean).join(' ')}`),
            '',
        ];
    })
        .join('\n')
        .trim();
}
