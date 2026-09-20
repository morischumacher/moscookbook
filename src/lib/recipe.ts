export interface Ingredient {
    amount: string;
    item: string;
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
