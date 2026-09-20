export interface Ingredient {
    amount: string;
    item: string;
}

/**
 * Ingredients are stored as a JSON string on the Recipe row. Never trust that
 * string: a hand-edited or legacy row must not take a page down.
 */
export function parseIngredients(raw: string | null | undefined): Ingredient[] {
    if (!raw) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
        .filter((entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null)
        .map((entry) => ({
            amount: typeof entry.amount === 'string' ? entry.amount : '',
            item: typeof entry.item === 'string' ? entry.item : '',
        }))
        .filter((ingredient) => ingredient.item.trim() !== '' || ingredient.amount.trim() !== '');
}

export function serializeIngredients(ingredients: Ingredient[]): string {
    return JSON.stringify(
        ingredients
            .map((ingredient) => ({
                amount: ingredient.amount.trim(),
                item: ingredient.item.trim(),
            }))
            .filter((ingredient) => ingredient.item !== '')
    );
}

const GERMAN_TRANSLITERATIONS: Record<string, string> = {
    ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
    à: 'a', á: 'a', â: 'a', ã: 'a', å: 'a',
    è: 'e', é: 'e', ê: 'e', ë: 'e',
    ì: 'i', í: 'i', î: 'i', ï: 'i',
    ò: 'o', ó: 'o', ô: 'o', õ: 'o', ø: 'o',
    ù: 'u', ú: 'u', û: 'u',
    ç: 'c', ñ: 'n',
};

/** "Käsespätzle mit Röstzwiebeln" -> "kaesespaetzle-mit-roestzwiebeln" */
export function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/[äöüßàáâãåèéêëìíîïòóôõøùúûçñ]/g, (char) => GERMAN_TRANSLITERATIONS[char] ?? char)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 180);
}
