import { splitAmount, formatAmount, type AmountParts } from './ingredientParts';
import { displayName, ingredientKey, itemName } from './ingredientNames';
import { singular, expandUmlauts } from './searchText';
import { fromBase, isCountUnit, toBase, unitOf, unitSpelling, type Measured } from './units';
import { shapeOf } from './ingredientShape';
import { lessPart, partsOf, settled as settledAmount, withPart, type Part } from './shoppingParts';

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
    | 'meat'
    | 'dairy'
    | 'bakery'
    | 'pantry'
    /** Hard to get: the Asian shop, a delicatessen ("Gochugaru", "Kaffirlimettenblätter"). */
    | 'special'
    | 'frozen'
    | 'other'
    | 'basics'
    /** What a recipe marks "(optional)" (lib/ingredientShape): last, under its own heading. */
    | 'optional';

/**
 * In the order a shop is usually walked, then what needs another shop, then
 * what is probably at home. "Getränke" and "Gewürze & Backen" are gone (the
 * owner's wish): lime juice is limes, stock and spices are the store cupboard.
 */
export const AISLES: Aisle[] = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'special', 'other', 'basics', 'optional'];

/** Every aisle a line can be given by hand (admin → Zutaten), "optional" being the recipe's to say. */
export const CHOOSABLE_AISLES: Aisle[] = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'special', 'other', 'basics'];

export const isAisle = (value: string | null | undefined): value is Aisle => (AISLES as string[]).includes(value ?? '');

/** An optional line is its own line: "Chili (optional)" is not added to the chili the dish needs. */
export const OPTIONAL_KEY = 'opt:';
export const keyFor = (key: string, aisle: string) => (aisle === 'optional' && !key.startsWith(OPTIONAL_KEY) ? OPTIONAL_KEY + key : key);

/*
 * The first rule that matches decides, so the order matters: what is hard to
 * get before the produce it would otherwise be ("Thai-Basilikum"), sauces and
 * pastes before the meat or fish in their name ("Fischsauce", "Hühnerbrühe"),
 * fresh citrus juice with the fruit it is squeezed from.
 */
const AISLE_RULES: Array<[Aisle, RegExp]> = [
    // Things almost every kitchen has: still listed, at the end, under their own heading.
    ['basics', /^(salz|meersalz|pfeffer|schwarzer pfeffer|salt|sea salt|pepper|black pepper|öl|oil|neutrales öl|pflanzenöl|sonnenblumenöl|rapsöl|olivenöl|olive oil|vegetable oil|neutral oil|zucker|sugar|essig|vinegar)$/i],
    ['special', /gochugaru|gochujang|doenjang|kimchi|saeujeot|miso|dashi|kombu|nori|wakame|bonito|katsuobushi|mirin|\bsake\b|shaoxing|shao ?hsing|klebreis|sticky rice|glutinous|reispapier|rice paper|thai[- ]?basilikum|thai basil|thai[- ]?chili|bird'?s eye|kaffir|makrut|limettenbl|lime lea|zitronengras|lemongrass|galgant|galangal|tamarinde|tamarind|palmzucker|palm sugar|pandan|shiso|perilla|yuzu|szechuan|sichuan|szechuanpfeffer|doubanjiang|black bean sauce|hoisin|sambal|sriracha|tteok|udon|soba|ramen|reisnudel|rice noodle|glasnudel|glass noodle|enoki|shiitake|wood ear|mu-?err|bean sprout|sojasprossen|bohnensprossen|pak ?choi|bok ?choy|daikon|furikake|panko|kecap|fischsoße|fish sauce|fischsauce|austernsauce|oyster sauce/i],
    ['frozen', /tiefkühl|tiefgekühlt|gefroren|frozen|\btk\b|tk-/i],
    // A sauce, a paste, a stock or a powder is the store cupboard, whatever its name says it is made of.
    ['pantry', /(sauce|soße|sosse|brühe|fond|stock|broth|bouillon|paste|pulver|powder|gewürz|mischung|extrakt|extract)\b|sojasauce|soy sauce|worcester|ketchup|mayonnaise|senf|mustard|tomatenmark|tomato paste|passata|dosentomate|canned|konserve|\bdose\b|kokosmilch|coconut milk|kokoscreme|getrocknet|dried|tomatenmark/i],
    ['produce', /(zitronen|limetten|orangen)saft|(lemon|lime|orange) juice|zwiebel|onion|schalott|shallot|knoblauch|garlic|tomate|tomato|kartoffel|potato|karotte|möhre|carrot|paprika(?!pulver)|bell pepper|zucchini|courgette|aubergine|eggplant|gurke|cucumber|salat|lettuce|spinat|spinach|kohl|cabbage|brokkoli|broccoli|lauch|leek|sellerie|celery|pilz|champignon|mushroom|ingwer|ginger|chili|jalape|zitrone|lemon|limette|\blimes?\b|apfel|apple|banane|banana|beere|berr|orange|birne|pfirsich|peach|aprikose|pflaume|kirsche|mango|ananas|\bpears?\b|kürbis|pumpkin|squash|avocado|\bmais|\bcorn\b|bohne|bean|erbse|\bpeas?\b|kräuter|herb|petersilie|parsley|basilikum|basil|koriander(?!samen|pulver)|cilantro|coriander|schnittlauch|chives|dill|minze|\bmint\b|rosmarin|rosemary|thymian|thyme|frühlingszwiebel|spring onion|scallion|rucola|rocket|radieschen|radish|rettich|fenchel|fennel|rote bete|beet|süßkartoffel|sweet potato|spargel|asparagus|artischocke|obst|fruit|gemüse|vegetable/i],
    ['meat', /fleisch|hähnchen|huhn|chicken|rind|beef|schwein|pork|hack|mince|speck|bacon|schinken|\bham\b|wurst|sausage|lamm|lamb|pute|turkey|ente|duck|fisch|fish|lachs|salmon|thunfisch|tuna|garnele|shrimp|prawn|scampi|hering|forelle|kabeljau|dorade|muschel|mussel|tintenfisch|squid|oktopus/i],
    ['dairy', /milch|milk|sahne|cream|butter|joghurt|yogurt|yoghurt|quark|käse|cheese|parmesan|mozzarella|feta|ricotta|mascarpone|schmand|crème|creme fraiche|\bei\b|eier|\beggs?\b|tofu|tempeh/i],
    ['bakery', /brot|bread|brötchen|\brolls?\b|baguette|toast|tortilla|wrap|pita|blätterteig|puff pastry|pizzateig/i],
    ['pantry', /mehl|flour|stärke|starch|zucker|sugar|reis|rice|nudel|pasta|spaghetti|penne|spätzle|spaetzle|gnocchi|tortellini|ravioli|lasagne|linsen|lentil|kichererbse|chickpea|\bdosen?\b|\bcans?\b|konserve|passata|tomatenmark|öl|oil|essig|vinegar|honig|honey|nüsse|nuts|mandel|almond|sesam|sesame|erdnuss|peanut|haferflocken|oats|schokolade|chocolate|kakao|cocoa|kokosmilch|coconut milk|sirup|syrup|couscous|bulgur|quinoa|polenta|grieß|semolina|hefe|yeast|backpulver|baking (powder|soda)|natron|vanille|vanilla|zimt|cinnamon|kreuzkümmel|cumin|kurkuma|turmeric|curry|oregano|muskat|nutmeg|lorbeer|bay lea|garam masala|chiliflocken|chili flakes|saft|juice|wein|wine/i],
];

/**
 * Where a line goes in the shop. "Wasser oder Hühnerbrühe": by the part that
 * is bought. A name the rules do not know is "other" — and any ingredient can
 * be given its aisle by hand on admin → Zutaten, which beats every rule.
 */
export function aisleOf(name: string): Aisle {
    const parts = name.trim().toLowerCase().split(/\s+(?:oder|or)\s+|\s*\/\s*/);
    const bought = parts.find((part) => !NEVER_BOUGHT.test(part.trim())) ?? parts[0];
    for (const [aisle, pattern] of AISLE_RULES) if (pattern.test(bought)) return aisle;
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
    // "-nen" is a plural of "-ne" (Zitronen, Bananen): drop the n first, or
    // the plural loses three letters and the singular one, and "Zitrone" and
    // "Zitronen" never meet.
    const last = words[words.length - 1].replace(/(?<=\p{L}{3})nen$/u, 'ne');
    words[words.length - 1] = settled(last);
    return words.join(' ');
}

/**
 * The ending taken off until none is left. Once was not enough: it also took
 * one off a word that was singular already, so "onion" became "onio" and
 * "onions" became "onion", and one onion and two never met on the list.
 * Taken to the end, both arrive at the same stem.
 */
/** Plurals no ending rule reaches: too short to strip safely, or irregular. */
const IRREGULAR: Record<string, string> = { eier: 'ei', eggs: 'egg' };

function settled(word: string): string {
    if (IRREGULAR[word]) return IRREGULAR[word];
    let current = singular(word) ?? singular(expandUmlauts(word)) ?? word;
    for (let step = 0; step < 3; step += 1) {
        const next = singular(current);
        if (next === null || next === current) break;
        current = next;
    }
    return current;
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
        // "Ingwer, frisch gerieben (optional)": the ingredient is what is bought.
        const shape = shapeOf(ingredient.name);
        // Its base as it is: a comma left in it is one between adjectives ("fermentierte, gesalzene Garnelen").
        const name = shape.base.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
        if (!name || NEVER_BOUGHT.test(name)) return [];
        const aisle: Aisle = shape.optional ? 'optional' : aisleOf(name);

        const scaled: AmountParts = {
            quantity: ingredient.quantity === null ? null : ingredient.quantity * factor,
            quantityMax: ingredient.quantityMax === null ? null : ingredient.quantityMax * factor,
            unit: ingredient.unit,
        };
        const measured = toBase(scaled, name);

        return [
            {
                name,
                // "Frühlingszwiebeln" and "green onions" are one line (lib/ingredientNames).
                key: keyFor(ingredientKey(name), aisle),
                measure: measured?.key ?? null,
                amount: measured?.amount ?? null,
                aisle,
                source,
            },
        ];
    });
}

/** A line typed by hand: "2 Zitronen", "500 g Mehl", "Klopapier". */
export function lineFromText(text: string): PlannedLine | null {
    // "½ Zitrone", "1½ Tassen": the glyph as a number the patterns read.
    const trimmed = text
        .trim()
        .slice(0, 200)
        .replace(/(\d)?([½⅓⅔¼¾⅛⅜⅝⅞⅕])/g, (_, digit: string | undefined, glyph: string) => {
            const ascii = ({ '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5' } as Record<string, string>)[glyph];
            return digit ? `${digit} ${ascii}` : ascii;
        })
        // "500g Mehl": the unit glued to the number, as it is often typed.
        .replace(/^(\d+(?:[.,]\d+)?)([a-zA-ZäöüÄÖÜ]+\.?)\s/, '$1 $2 ');
    if (!trimmed) return null;

    // A mixed number too — "1 1/2 EL Zucker" read "1/2" as the unit.
    const match = /^(\S*\d\S*(?:\s+\d+\/\d+)?(?:\s*(?:-|–|bis)\s*\S*\d\S*)?)\s+(\S+)\s+(.+)$/.exec(trimmed);
    // "500 g Mehl": number, unit, name. "2 Zitronen": number, name.
    let parts: AmountParts = { quantity: null, quantityMax: null, unit: null };
    let name = trimmed;

    if (match) {
        const withUnit = splitAmount(`${match[1]} ${match[2]}`);
        // Only a real unit: in "3 große Zwiebeln" the second word is part
        // of the name, and taking it as the unit made a line of its own.
        const known = withUnit.unit !== null && (unitOf(withUnit.unit) !== null || isCountUnit(withUnit.unit));
        if (withUnit.quantity !== null && withUnit.unit && known) {
            parts = withUnit;
            name = match[3];
        }
    }
    if (parts.quantity === null) {
        // "2 Zitronen", "2-3 Äpfel", "1/2 Zitrone", "1 1/2 Gurken".
        const lead = /^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+)?(?:\s*(?:-|–|bis)\s*\d+(?:[.,]\d+)?)?)\s+(.+)$/.exec(trimmed);
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
    /** How much is for which recipe (lib/shoppingParts); none on a line from before. */
    parts?: unknown;
}

type Touched = { id: number; measure?: string | null; amount: number | null; sources: string[]; parts: Part[] };

export interface MergePlan {
    creates: (PlannedLine & { sources: string[]; parts: Part[] })[];
    updates: Touched[];
}

/**
 * The open line a new one goes onto: the same thing measured the same way;
 * or, for "Salz" with no amount, any line of it ("1 TL Salz" just gains the
 * recipe); or, for "1 TL Salz", a line of it with no amount yet (which takes
 * the amount). Otherwise none: grams and spoons stay apart until they are
 * converted (lib/shoppingParts).
 */
function targetFor<T extends { key: string; measure?: string | null; amount: number | null }>(lines: T[], line: { key: string; measure: string | null }): T | undefined {
    const same = lines.filter((other) => other.key === line.key);
    return (
        same.find((other) => (other.measure ?? null) === line.measure) ??
        (line.measure === null ? same[0] : same.find((other) => (other.measure ?? null) === null && other.amount === null))
    );
}

/**
 * How new lines join a list: onto an open line for the same thing measured
 * the same way, or as new lines. A line already ticked off is not added to —
 * what was bought was bought, and the extra is a new thing to buy. Each line
 * keeps how much of it is for which recipe.
 */
export function mergeInto(existing: ExistingLine[], planned: PlannedLine[]): MergePlan {
    const open: (Touched & { key: string })[] = existing
        .filter((line) => !line.checked)
        .map((line) => ({ id: line.id, key: line.key, measure: line.measure, amount: line.amount, sources: line.sources, parts: partsOf(line) }));
    const created: (PlannedLine & { sources: string[]; parts: Part[] })[] = [];
    const touched = new Set<number>();

    const add = (amount: number | null, extra: number | null) =>
        amount === null && extra === null ? null : (amount ?? 0) + (extra ?? 0);
    const withSource = (sources: string[], source: string | null) =>
        source && !sources.includes(source) ? [...sources, source] : sources;
    // Onto a line: its amount, recipes and parts; and its unit, when it had none.
    const join = (target: { measure?: string | null; amount: number | null; sources: string[]; parts: Part[] }, line: PlannedLine) => {
        if ((target.measure ?? null) === null && line.measure !== null) target.measure = line.measure;
        target.amount = add(target.amount, line.amount);
        target.sources = withSource(target.sources, line.source);
        target.parts = withPart(target.parts, { s: line.source, a: line.amount });
    };

    for (const line of planned) {
        const target = targetFor(open, line);
        if (target) {
            join(target, line);
            touched.add(target.id);
            continue;
        }
        const pending = targetFor(created, line);
        if (pending) {
            join(pending, line);
            continue;
        }
        created.push({ ...line, sources: line.source ? [line.source] : [], parts: [{ s: line.source, a: line.amount }] });
    }

    return {
        creates: created,
        updates: open.filter((line) => touched.has(line.id)).map(({ id, measure, amount, sources, parts }) => ({ id, measure, amount, sources, parts })),
    };
}

export interface RemovalPlan {
    updates: Touched[];
    deletes: number[];
}

/**
 * Taking back what `mergeInto` added: the same lines subtracted again.
 *
 * "Wieder entfernen" beside the button that just added a recipe. A line that
 * was on the list before keeps what it had — only the recipe's share comes
 * off, and the recipe's name leaves its sources — and a line that only this
 * recipe put there goes. Ticked lines are left alone: those are bought.
 */
export function removeFrom(existing: ExistingLine[], planned: PlannedLine[]): RemovalPlan {
    const open: (Touched & { key: string })[] = existing
        .filter((line) => !line.checked)
        .map((line) => ({ id: line.id, key: line.key, measure: line.measure, amount: line.amount, sources: [...line.sources], parts: partsOf(line) }));

    const touched = new Map<number, Touched>();
    for (const line of planned) {
        // Where mergeInto put it: the same line, found the same way.
        const target = targetFor(open, line);
        if (!target) continue;
        if (target.amount !== null && line.amount !== null && (target.measure ?? null) === line.measure) {
            target.amount = Math.round((target.amount - line.amount) * 1000) / 1000;
        }
        target.parts = lessPart(target.parts, line.source, line.amount);
        if (target.amount !== null) target.amount = settledAmount(target.measure ?? null, target.amount, target.parts);
        // The name goes once none of the recipe's share is left (half the servings taken off keeps it).
        if (line.source && !target.parts.some((part) => part.s === line.source)) target.sources = target.sources.filter((source) => source !== line.source);
        touched.set(target.id, target);
    }

    const updates: RemovalPlan['updates'] = [];
    const deletes: number[] = [];
    for (const line of touched.values()) {
        // Gone when nobody's share is left: a line typed by hand is somebody's too.
        const emptied = line.amount !== null && line.amount <= 0.0001;
        if (line.parts.length === 0 || (emptied && line.parts.every((part) => part.a !== null))) deletes.push(line.id);
        else updates.push(emptied ? { ...line, amount: null } : line);
    }
    return { updates, deletes };
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
    // "3 Zehen" on the German list, "3 cloves" on the English one.
    return formatAmount({ ...parts, unit: unitSpelling(parts.unit, parts.quantity ?? 0, locale) }, 1, locale);
}

/** The whole list as text, for sending: grouped, ticked lines left out. */
export function listAsText(
    lines: { name: string; measure: string | null; amount: number | null; aisle: string; checked: boolean; item?: { de: string; en: string } | null }[],
    aisleName: (aisle: Aisle) => string,
    locale: 'en' | 'de'
): string {
    return AISLES.flatMap((aisle) => {
        const here = lines.filter((line) => line.aisle === aisle && !line.checked);
        if (here.length === 0) return [];
        return [
            aisleName(aisle),
            ...here.map((line) => `- ${[amountLabel(line.measure, line.amount, locale), (line.item && itemName(line.item, locale, line.amount, line.measure)) || displayName(line.name, locale, line.amount, line.measure)].filter(Boolean).join(' ')}`),
            '',
        ];
    })
        .join('\n')
        .trim();
}
