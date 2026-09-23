/**
 * Tags: free words on a recipe ("grillen", "weihnachten", "meal prep"), and
 * two with a fixed meaning — vegetarian and vegan — that the form suggests
 * from the ingredients and the front page filters on.
 *
 * Stored as they are written, trimmed and in lower case, so "Grillen" and
 * "grillen " are one tag. The two diet tags are stored under English keys and
 * translated for display, so a filter works whichever language added them.
 */

export const DIET_TAGS = ['vegetarian', 'vegan'] as const;
export type DietTag = (typeof DIET_TAGS)[number];

/** What meat or fish is in it — tags with fixed names, so they filter and show an icon. */
export const PROTEIN_TAGS = ['beef', 'pork', 'poultry', 'lamb', 'game', 'fish', 'seafood'] as const;
export type ProteinTag = (typeof PROTEIN_TAGS)[number];

/** The tags the cookbook knows by name: shown with an icon, picked from a list, never typed. */
export const KNOWN_TAGS: readonly string[] = [...DIET_TAGS, ...PROTEIN_TAGS];

export const TAG_ICONS: Record<string, string> = {
    vegan: '🌱',
    vegetarian: '🥕',
    beef: '🐄',
    pork: '🐖',
    poultry: '🐔',
    lamb: '🐑',
    game: '🦌',
    fish: '🐟',
    seafood: '🦐',
};

/** 0 = not hot, 1–3 chillies. */
export const MAX_SPICINESS = 3;
export function chillies(spiciness: number): string {
    return '🌶️'.repeat(Math.max(0, Math.min(MAX_SPICINESS, Math.round(spiciness))));
}

export const MAX_TAGS = 12;

export function normaliseTags(tags: string[]): string[] {
    const seen = new Set<string>();
    for (const raw of tags) {
        const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30);
        if (!tag) continue;
        seen.add(DIET_ALIASES[tag] ?? tag);
    }
    return [...seen].slice(0, MAX_TAGS);
}

/** What people type for the two diet tags, in either language. */
const DIET_ALIASES: Record<string, DietTag | ProteinTag> = {
    vegetarisch: 'vegetarian',
    veggie: 'vegetarian',
    vegetarian: 'vegetarian',
    vegan: 'vegan',
    rind: 'beef',
    rindfleisch: 'beef',
    beef: 'beef',
    schwein: 'pork',
    schweinefleisch: 'pork',
    pork: 'pork',
    geflügel: 'poultry',
    gefluegel: 'poultry',
    huhn: 'poultry',
    hähnchen: 'poultry',
    haehnchen: 'poultry',
    chicken: 'poultry',
    pute: 'poultry',
    ente: 'poultry',
    poultry: 'poultry',
    lamm: 'lamb',
    lamb: 'lamb',
    wild: 'game',
    game: 'game',
    fisch: 'fish',
    fish: 'fish',
    meeresfrüchte: 'seafood',
    meeresfruechte: 'seafood',
    garnelen: 'seafood',
    seafood: 'seafood',
};

const MEAT_OR_FISH =
    /fleisch|hähnchen|huhn|hühner|chicken|rind|beef|schwein|pork|hack|mince|speck|bacon|schinken|ham\b|wurst|sausage|salami|chorizo|lamm|lamb|pute|turkey|ente|duck|kalb|veal|wild|venison|fisch|fish|lachs|salmon|thunfisch|tuna|sardell|anchov|garnele|shrimp|prawn|muschel|mussel|tintenfisch|squid|gelatine|gelatin|fond\b|fischsauce|fish sauce|worcester/i;

const ANIMAL =
    /milch|milk|sahne|cream|butter|joghurt|yogurt|yoghurt|quark|käse|cheese|parmesan|mozzarella|feta|ricotta|mascarpone|schmand|crème|ei\b|eier|egg|honig|honey|ghee/i;

/** Which diet tags a recipe's ingredients allow. Offered, never set on their own. */
export function dietFrom(ingredientNames: string[]): DietTag[] {
    if (ingredientNames.length === 0) return [];
    // Plant milks and vegan butter are not the animal kind.
    const names = ingredientNames.map((name) => name.replace(/(hafer|soja|mandel|kokos|oat|soy|almond|coconut|vegane?)\s*-?\s*(milch|milk|butter|joghurt|yogurt|sahne|cream)/gi, ''));
    if (names.some((name) => MEAT_OR_FISH.test(name))) return [];
    if (names.some((name) => ANIMAL.test(name))) return ['vegetarian'];
    return ['vegetarian', 'vegan'];
}

/** A recipe counts as quick when its times add up to half an hour or less. */
export const QUICK_MINUTES = 30;
