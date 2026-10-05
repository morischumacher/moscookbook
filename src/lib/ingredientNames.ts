import { shoppingKey } from './shopping';

/**
 * The common ingredients by one name in both languages, so the shopping list
 * meets "Frühlingszwiebeln" and "green onions/scallions" as one thing and
 * shows it in the reader's language (the owner's wish: recipes in English and
 * German were listed twice).
 *
 * Deliberately conservative. A name counts as one of these only when all of
 * it is — after what is cut off anyway (a preparation after the comma, words
 * like "fresh" or "fein gehackt") — and when it names two things with "/" or
 * "or", both must be the same one. "chicken breast or firm tofu" is neither:
 * a wrong merge on a shopping list is worse than a missing one.
 *
 * `de` and `en` are [one, many]; `also` are further names in either
 * language, written in the singular — plurals are folded by `shoppingKey`.
 */
interface Entry {
    id: string;
    de: [string, string];
    en: [string, string];
    also?: string[];
}

const ENTRIES: Entry[] = [
    { id: 'spring-onion', de: ['Frühlingszwiebel', 'Frühlingszwiebeln'], en: ['spring onion', 'spring onions'], also: ['green onion', 'scallion', 'lauchzwiebel', 'salad onion'] },
    { id: 'onion', de: ['Zwiebel', 'Zwiebeln'], en: ['onion', 'onions'], also: ['yellow onion', 'gelbe zwiebel', 'brown onion'] },
    { id: 'red-onion', de: ['rote Zwiebel', 'rote Zwiebeln'], en: ['red onion', 'red onions'] },
    { id: 'shallot', de: ['Schalotte', 'Schalotten'], en: ['shallot', 'shallots'] },
    { id: 'garlic', de: ['Knoblauch', 'Knoblauch'], en: ['garlic', 'garlic'], also: ['knoblauchzehe', 'garlic clove', 'clove garlic', 'clove of garlic'] },
    { id: 'ginger', de: ['Ingwer', 'Ingwer'], en: ['ginger', 'ginger'], also: ['fresh ginger', 'ginger root', 'ingwerwurzel', 'frischer ingwer'] },
    { id: 'leek', de: ['Lauch', 'Lauch'], en: ['leek', 'leeks'], also: ['porree'] },
    { id: 'carrot', de: ['Karotte', 'Karotten'], en: ['carrot', 'carrots'], also: ['möhre', 'mohrrübe', 'gelbe rübe'] },
    { id: 'potato', de: ['Kartoffel', 'Kartoffeln'], en: ['potato', 'potatoes'] },
    { id: 'sweet-potato', de: ['Süßkartoffel', 'Süßkartoffeln'], en: ['sweet potato', 'sweet potatoes'] },
    { id: 'tomato', de: ['Tomate', 'Tomaten'], en: ['tomato', 'tomatoes'] },
    { id: 'cherry-tomato', de: ['Kirschtomate', 'Kirschtomaten'], en: ['cherry tomato', 'cherry tomatoes'], also: ['cocktailtomate'] },
    { id: 'cucumber', de: ['Gurke', 'Gurken'], en: ['cucumber', 'cucumbers'], also: ['salatgurke'] },
    { id: 'zucchini', de: ['Zucchini', 'Zucchini'], en: ['courgette', 'courgettes'], also: ['zucchini', 'zucchino'] },
    { id: 'aubergine', de: ['Aubergine', 'Auberginen'], en: ['aubergine', 'aubergines'], also: ['eggplant'] },
    { id: 'bell-pepper', de: ['Paprika', 'Paprika'], en: ['bell pepper', 'bell peppers'], also: ['paprikaschote', 'capsicum', 'sweet pepper'] },
    { id: 'red-bell-pepper', de: ['rote Paprika', 'rote Paprika'], en: ['red bell pepper', 'red bell peppers'], also: ['red pepper', 'rote paprikaschote'] },
    { id: 'chili', de: ['Chilischote', 'Chilischoten'], en: ['chili', 'chilies'], also: ['chilli', 'chile', 'chili pepper', 'peperoni', 'chili'] },
    { id: 'mushroom', de: ['Champignon', 'Champignons'], en: ['mushroom', 'mushrooms'], also: ['pilz', 'button mushroom'] },
    { id: 'spinach', de: ['Spinat', 'Spinat'], en: ['spinach', 'spinach'], also: ['baby spinach', 'babyspinat', 'blattspinat'] },
    { id: 'lettuce', de: ['Salat', 'Salat'], en: ['lettuce', 'lettuce'], also: ['kopfsalat'] },
    { id: 'cabbage', de: ['Kohl', 'Kohl'], en: ['cabbage', 'cabbage'], also: ['weißkohl', 'white cabbage'] },
    { id: 'napa-cabbage', de: ['Chinakohl', 'Chinakohl'], en: ['napa cabbage', 'napa cabbage'], also: ['chinese cabbage', 'nappa cabbage'] },
    { id: 'broccoli', de: ['Brokkoli', 'Brokkoli'], en: ['broccoli', 'broccoli'] },
    { id: 'cauliflower', de: ['Blumenkohl', 'Blumenkohl'], en: ['cauliflower', 'cauliflower'] },
    { id: 'celery', de: ['Staudensellerie', 'Staudensellerie'], en: ['celery', 'celery'], also: ['stangensellerie', 'celery stalk'] },
    { id: 'pumpkin', de: ['Kürbis', 'Kürbisse'], en: ['pumpkin', 'pumpkins'], also: ['squash', 'hokkaido'] },
    { id: 'corn', de: ['Mais', 'Mais'], en: ['corn', 'corn'], also: ['sweetcorn', 'maiskolben'] },
    { id: 'peas', de: ['Erbsen', 'Erbsen'], en: ['peas', 'peas'], also: ['erbse', 'pea', 'green pea'] },
    { id: 'green-beans', de: ['grüne Bohnen', 'grüne Bohnen'], en: ['green beans', 'green beans'], also: ['green bean', 'grüne bohne', 'prinzessbohne', 'string bean'] },
    { id: 'avocado', de: ['Avocado', 'Avocados'], en: ['avocado', 'avocados'] },
    { id: 'lemon', de: ['Zitrone', 'Zitronen'], en: ['lemon', 'lemons'] },
    { id: 'lime', de: ['Limette', 'Limetten'], en: ['lime', 'limes'] },
    { id: 'orange', de: ['Orange', 'Orangen'], en: ['orange', 'oranges'], also: ['apfelsine'] },
    { id: 'apple', de: ['Apfel', 'Äpfel'], en: ['apple', 'apples'] },
    { id: 'banana', de: ['Banane', 'Bananen'], en: ['banana', 'bananas'] },
    { id: 'parsley', de: ['Petersilie', 'Petersilie'], en: ['parsley', 'parsley'], also: ['glatte petersilie', 'flat-leaf parsley', 'italian parsley'] },
    { id: 'basil', de: ['Basilikum', 'Basilikum'], en: ['basil', 'basil'], also: ['thai basil', 'thai-basilikum'] },
    { id: 'coriander', de: ['Koriander', 'Koriander'], en: ['coriander', 'coriander'], also: ['cilantro', 'koriandergrün', 'fresh coriander'] },
    { id: 'mint', de: ['Minze', 'Minze'], en: ['mint', 'mint'] },
    { id: 'dill', de: ['Dill', 'Dill'], en: ['dill', 'dill'] },
    { id: 'chives', de: ['Schnittlauch', 'Schnittlauch'], en: ['chives', 'chives'], also: ['chive'] },
    { id: 'rosemary', de: ['Rosmarin', 'Rosmarin'], en: ['rosemary', 'rosemary'] },
    { id: 'thyme', de: ['Thymian', 'Thymian'], en: ['thyme', 'thyme'] },
    { id: 'egg', de: ['Ei', 'Eier'], en: ['egg', 'eggs'], also: ['large egg'] },
    { id: 'butter', de: ['Butter', 'Butter'], en: ['butter', 'butter'], also: ['unsalted butter', 'ungesalzene butter'] },
    { id: 'milk', de: ['Milch', 'Milch'], en: ['milk', 'milk'], also: ['vollmilch', 'whole milk'] },
    { id: 'cream', de: ['Sahne', 'Sahne'], en: ['cream', 'cream'], also: ['schlagsahne', 'heavy cream', 'double cream', 'whipping cream'] },
    { id: 'sour-cream', de: ['saure Sahne', 'saure Sahne'], en: ['sour cream', 'sour cream'], also: ['schmand'] },
    { id: 'creme-fraiche', de: ['Crème fraîche', 'Crème fraîche'], en: ['crème fraîche', 'crème fraîche'], also: ['creme fraiche'] },
    { id: 'yogurt', de: ['Joghurt', 'Joghurt'], en: ['yogurt', 'yogurt'], also: ['yoghurt', 'naturjoghurt', 'greek yogurt', 'griechischer joghurt'] },
    { id: 'parmesan', de: ['Parmesan', 'Parmesan'], en: ['parmesan', 'parmesan'], also: ['parmigiano', 'parmigiano reggiano', 'grated parmesan', 'geriebener parmesan'] },
    { id: 'mozzarella', de: ['Mozzarella', 'Mozzarella'], en: ['mozzarella', 'mozzarella'] },
    { id: 'feta', de: ['Feta', 'Feta'], en: ['feta', 'feta'], also: ['schafskäse'] },
    { id: 'flour', de: ['Mehl', 'Mehl'], en: ['flour', 'flour'], also: ['all-purpose flour', 'plain flour', 'weizenmehl', 'weizenmehl type 405'] },
    { id: 'sugar', de: ['Zucker', 'Zucker'], en: ['sugar', 'sugar'], also: ['white sugar', 'granulated sugar', 'weißer zucker'] },
    { id: 'brown-sugar', de: ['brauner Zucker', 'brauner Zucker'], en: ['brown sugar', 'brown sugar'] },
    { id: 'powdered-sugar', de: ['Puderzucker', 'Puderzucker'], en: ['icing sugar', 'icing sugar'], also: ['powdered sugar', "confectioners' sugar"] },
    { id: 'salt', de: ['Salz', 'Salz'], en: ['salt', 'salt'], also: ['sea salt', 'meersalz', 'kosher salt'] },
    { id: 'black-pepper', de: ['Pfeffer', 'Pfeffer'], en: ['black pepper', 'black pepper'], also: ['pepper', 'schwarzer pfeffer', 'ground black pepper'] },
    { id: 'olive-oil', de: ['Olivenöl', 'Olivenöl'], en: ['olive oil', 'olive oil'], also: ['extra virgin olive oil', 'natives olivenöl'] },
    { id: 'neutral-oil', de: ['neutrales Öl', 'neutrales Öl'], en: ['neutral oil', 'neutral oil'], also: ['vegetable oil', 'pflanzenöl', 'sonnenblumenöl', 'sunflower oil', 'rapsöl', 'canola oil', 'rapeseed oil'] },
    { id: 'sesame-oil', de: ['Sesamöl', 'Sesamöl'], en: ['sesame oil', 'sesame oil'], also: ['toasted sesame oil', 'geröstetes sesamöl'] },
    { id: 'soy-sauce', de: ['Sojasauce', 'Sojasauce'], en: ['soy sauce', 'soy sauce'], also: ['sojasoße', 'shoyu', 'light soy sauce', 'helle sojasauce'] },
    { id: 'fish-sauce', de: ['Fischsauce', 'Fischsauce'], en: ['fish sauce', 'fish sauce'], also: ['fischsoße'] },
    { id: 'rice-vinegar', de: ['Reisessig', 'Reisessig'], en: ['rice vinegar', 'rice vinegar'], also: ['rice wine vinegar'] },
    { id: 'vinegar', de: ['Essig', 'Essig'], en: ['vinegar', 'vinegar'] },
    { id: 'mirin', de: ['Mirin', 'Mirin'], en: ['mirin', 'mirin'] },
    { id: 'honey', de: ['Honig', 'Honig'], en: ['honey', 'honey'] },
    { id: 'mustard', de: ['Senf', 'Senf'], en: ['mustard', 'mustard'] },
    { id: 'tomato-paste', de: ['Tomatenmark', 'Tomatenmark'], en: ['tomato paste', 'tomato paste'], also: ['tomato purée'] },
    { id: 'canned-tomatoes', de: ['Dosentomaten', 'Dosentomaten'], en: ['canned tomatoes', 'canned tomatoes'], also: ['tinned tomatoes', 'stückige tomaten', 'gehackte tomaten', 'chopped tomatoes', 'diced tomatoes'] },
    { id: 'coconut-milk', de: ['Kokosmilch', 'Kokosmilch'], en: ['coconut milk', 'coconut milk'] },
    { id: 'stock', de: ['Brühe', 'Brühe'], en: ['stock', 'stock'], also: ['broth', 'gemüsebrühe', 'vegetable stock', 'vegetable broth', 'hühnerbrühe', 'chicken stock', 'chicken broth'] },
    { id: 'rice', de: ['Reis', 'Reis'], en: ['rice', 'rice'] },
    { id: 'jasmine-rice', de: ['Jasminreis', 'Jasminreis'], en: ['jasmine rice', 'jasmine rice'] },
    { id: 'pasta', de: ['Nudeln', 'Nudeln'], en: ['pasta', 'pasta'] },
    { id: 'spaghetti', de: ['Spaghetti', 'Spaghetti'], en: ['spaghetti', 'spaghetti'] },
    { id: 'breadcrumbs', de: ['Semmelbrösel', 'Semmelbrösel'], en: ['breadcrumbs', 'breadcrumbs'], also: ['paniermehl', 'panko', 'bread crumbs'] },
    { id: 'cornstarch', de: ['Speisestärke', 'Speisestärke'], en: ['cornstarch', 'cornstarch'], also: ['cornflour', 'maisstärke', 'stärke', 'potato starch', 'kartoffelstärke'] },
    { id: 'baking-powder', de: ['Backpulver', 'Backpulver'], en: ['baking powder', 'baking powder'] },
    { id: 'yeast', de: ['Hefe', 'Hefe'], en: ['yeast', 'yeast'], also: ['trockenhefe', 'dry yeast', 'frischhefe'] },
    { id: 'chicken-breast', de: ['Hähnchenbrust', 'Hähnchenbrust'], en: ['chicken breast', 'chicken breasts'], also: ['hühnerbrust', 'hähnchenbrustfilet'] },
    { id: 'ground-beef', de: ['Rinderhackfleisch', 'Rinderhackfleisch'], en: ['ground beef', 'ground beef'], also: ['minced beef', 'beef mince', 'rinderhack'] },
    { id: 'tofu', de: ['Tofu', 'Tofu'], en: ['tofu', 'tofu'], also: ['firm tofu', 'fester tofu'] },
    { id: 'silken-tofu', de: ['Seidentofu', 'Seidentofu'], en: ['silken tofu', 'silken tofu'] },
    { id: 'chickpeas', de: ['Kichererbsen', 'Kichererbsen'], en: ['chickpeas', 'chickpeas'], also: ['chickpea', 'kichererbse', 'garbanzo bean'] },
    { id: 'lentils', de: ['Linsen', 'Linsen'], en: ['lentils', 'lentils'], also: ['lentil', 'linse'] },
    { id: 'cinnamon', de: ['Zimt', 'Zimt'], en: ['cinnamon', 'cinnamon'], also: ['ground cinnamon', 'zimtpulver'] },
    { id: 'cumin', de: ['Kreuzkümmel', 'Kreuzkümmel'], en: ['cumin', 'cumin'], also: ['ground cumin', 'cumin seed'] },
    { id: 'paprika', de: ['Paprikapulver', 'Paprikapulver'], en: ['paprika', 'paprika'], also: ['sweet paprika', 'smoked paprika', 'paprika edelsüß', 'geräuchertes paprikapulver'] },
    { id: 'chili-flakes', de: ['Chiliflocken', 'Chiliflocken'], en: ['chili flakes', 'chili flakes'], also: ['red pepper flakes', 'chilli flakes', 'gochugaru'] },
    { id: 'sesame', de: ['Sesam', 'Sesam'], en: ['sesame seeds', 'sesame seeds'], also: ['sesame seed', 'sesamsamen', 'sesame'] },
    { id: 'water', de: ['Wasser', 'Wasser'], en: ['water', 'water'] },
];

/** A preparation or a size, not the thing: dropped before the name is looked up. */
const NOISE = /\b(fresh|frisch(e|er|es|en)?|chopped|gehackt(e|er|es)?|fein|finely|grated|gerieben(e|er|es)?|minced|sliced|diced|gewürfelt(e|er|es)?|small|large|medium|klein(e|er|es)?|groß(e|er|es)?|mittelgroß(e|er|es)?|ripe|reif(e|er|es)?|bio|organic)\b/gi;

// Built on first use: lib/shopping imports this file and this file uses its
// `shoppingKey`, so nothing may run at load time.
let byKey: Map<string, Entry> | null = null;
function keys(): Map<string, Entry> {
    if (byKey) return byKey;
    byKey = new Map();
    for (const entry of ENTRIES) {
        for (const name of [entry.de[0], entry.de[1], entry.en[0], entry.en[1], ...(entry.also ?? [])]) {
            const key = shoppingKey(name);
            if (key && !byKey.has(key)) byKey.set(key, entry);
        }
    }
    return byKey;
}
const BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]));

function lookUp(part: string): Entry | null {
    const BY_KEY = keys();
    const exact = BY_KEY.get(shoppingKey(part));
    if (exact) return exact;
    const plain = part.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
    return plain ? (BY_KEY.get(shoppingKey(plain)) ?? null) : null;
}

/** The ingredient a name is, when all of it is one of the common ones; null otherwise. */
export function commonIngredient(name: string): Entry | null {
    const core = name
        .replace(/\([^)]*\)/g, ' ')
        .split(/[,;]/)[0]
        .trim();
    if (!core) return null;
    const parts = core.split(/\s*\/\s*|\s+(?:or|oder)\s+/i).filter(Boolean);
    const found = parts.map(lookUp);
    if (found.some((entry) => entry === null)) return null;
    const first = found[0]!;
    return found.every((entry) => entry!.id === first.id) ? first : null;
}

/** What a shopping line is merged on: the common ingredient when it is one, else its folded name. */
export function ingredientKey(name: string): string {
    const entry = commonIngredient(name);
    return entry ? `ing:${entry.id}` : shoppingKey(name);
}

/** A common ingredient's name in a language, agreeing with its number; null for any other key. */
export function ingredientLabel(key: string, locale: 'de' | 'en', amount: number | null): string | null {
    if (!key.startsWith('ing:')) return null;
    const entry = BY_ID.get(key.slice(4));
    if (!entry) return null;
    return entry[locale][amount !== null && amount > 1 ? 1 : 0];
}

/**
 * A line's name as the reader reads it: the common ingredient in their
 * language, anything else as written. Singular only for one piece ("1
 * Zwiebel"); "1 Bund Frühlingszwiebeln" and "200 g Zwiebeln" are plural.
 */
export function displayName(name: string, locale: 'de' | 'en', amount: number | null, measure: string | null = null): string {
    const one = measure === 'count:' && amount !== null && amount <= 1;
    return ingredientLabel(ingredientKey(name), locale, one ? 1 : 2) ?? name;
}
