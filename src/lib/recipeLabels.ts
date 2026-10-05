/**
 * The categories and cuisines the recipe form suggests.
 *
 * Stored by these English keys and shown in the reader's language
 * (messages: `Categories.*`, `Cuisines.*`). Anything else a person types is
 * kept as they typed it and shown as it is — the lists are suggestions, not
 * a limit.
 */

export const CATEGORY_PRESETS = [
    'Breakfast',
    'Lunch',
    'Dinner',
    'Starter',
    'Main',
    'Side',
    'Soup',
    'Salad',
    'Dessert',
    'Baking',
    'Bread',
    'Snack',
    'Sauce',
    'Seasoning',
    'Drink',
] as const;

export const CUISINE_PRESETS = [
    'German',
    'Austrian',
    'Italian',
    'French',
    'Spanish',
    'Greek',
    'Turkish',
    'Middle Eastern',
    'Indian',
    'Thai',
    'Vietnamese',
    'Chinese',
    'Japanese',
    'Korean',
    'Asian',
    'Mexican',
    'American',
] as const;

/** Per field, when a recipe is written: few enough that the head shows every one (work #44). */
export const MAX_LABELS = 4;

/*
 * Other names for the same category or cuisine — English from imports,
 * German typed by hand: "Appetizer" and "Vorspeise" are one chip, not two.
 */
const CATEGORY_SYNONYMS: Record<string, string> = {
    appetizer: 'Starter', appetizers: 'Starter', starter: 'Starter', starters: 'Starter', vorspeise: 'Starter', vorspeisen: 'Starter', antipasti: 'Starter',
    side: 'Side', sides: 'Side', 'side dish': 'Side', 'side dishes': 'Side', beilage: 'Side', beilagen: 'Side',
    main: 'Main', 'main course': 'Main', 'main dish': 'Main', mains: 'Main', entree: 'Main', hauptgericht: 'Main', hauptspeise: 'Main', hauptgerichte: 'Main',
    breakfast: 'Breakfast', brunch: 'Breakfast', frühstück: 'Breakfast',
    lunch: 'Lunch', mittagessen: 'Lunch',
    dinner: 'Dinner', abendessen: 'Dinner', abendbrot: 'Dinner',
    soup: 'Soup', soups: 'Soup', suppe: 'Soup', suppen: 'Soup', eintopf: 'Soup', stew: 'Soup',
    salad: 'Salad', salads: 'Salad', salat: 'Salad', salate: 'Salad',
    dessert: 'Dessert', desserts: 'Dessert', nachtisch: 'Dessert', nachspeise: 'Dessert', süßspeise: 'Dessert',
    baking: 'Baking', backen: 'Baking', gebäck: 'Baking', kuchen: 'Baking', cake: 'Baking', cakes: 'Baking',
    bread: 'Bread', breads: 'Bread', brot: 'Bread',
    snack: 'Snack', snacks: 'Snack', fingerfood: 'Snack',
    sauce: 'Sauce', sauces: 'Sauce', soße: 'Sauce', sosse: 'Sauce', 'soße & dip': 'Sauce', dip: 'Sauce', dips: 'Sauce', dressing: 'Sauce',
    seasoning: 'Seasoning', seasonings: 'Seasoning', condiment: 'Seasoning', condiments: 'Seasoning', gewürz: 'Seasoning', gewürzmischung: 'Seasoning', würzmittel: 'Seasoning', 'spice mix': 'Seasoning', 'würze & gewürzmischung': 'Seasoning',
    drink: 'Drink', drinks: 'Drink', beverage: 'Drink', getränk: 'Drink', getränke: 'Drink', cocktail: 'Drink',
};

const CUISINE_SYNONYMS: Record<string, string> = {
    deutsch: 'German', german: 'German', österreichisch: 'Austrian', austrian: 'Austrian', italienisch: 'Italian', italian: 'Italian',
    französisch: 'French', french: 'French', spanisch: 'Spanish', spanish: 'Spanish', griechisch: 'Greek', greek: 'Greek',
    türkisch: 'Turkish', turkish: 'Turkish', orientalisch: 'Middle Eastern', 'middle eastern': 'Middle Eastern', 'nahöstlich': 'Middle Eastern',
    indisch: 'Indian', indian: 'Indian', thailändisch: 'Thai', thai: 'Thai', vietnamesisch: 'Vietnamese', vietnamese: 'Vietnamese',
    chinesisch: 'Chinese', chinese: 'Chinese', japanisch: 'Japanese', japanese: 'Japanese', koreanisch: 'Korean', korean: 'Korean',
    asiatisch: 'Asian', asian: 'Asian', mexikanisch: 'Mexican', mexican: 'Mexican', amerikanisch: 'American', american: 'American',
};

const canonical = (synonyms: Record<string, string>) => (value: string) => {
    const trimmed = value.trim();
    return synonyms[trimmed.toLowerCase()] ?? trimmed;
};

/** A category by its one key ("Vorspeise", "Appetizer" → "Starter"); anything unknown as typed. */
export const canonicalCategory = canonical(CATEGORY_SYNONYMS);
/** A cuisine by its one key ("Koreanisch" → "Korean"); anything unknown as typed. */
export const canonicalCuisine = canonical(CUISINE_SYNONYMS);

/** A list of them by their keys, each once. */
export const canonicalList = (values: string[], one: (value: string) => string) => [...new Set(values.map(one).filter(Boolean))];

/** For SQL: every synonym and its key, for bringing stored recipes in line. */
export const CATEGORY_SYNONYM_PAIRS = Object.entries(CATEGORY_SYNONYMS);
export const CUISINE_SYNONYM_PAIRS = Object.entries(CUISINE_SYNONYMS);
