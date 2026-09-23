/**
 * What a cook has ticked off, and how many they are cooking for.
 *
 * This lived in component state only, and on a phone that means it lived until
 * the next interruption. Safari discards backgrounded tabs as a matter of
 * routine; answer a message halfway through a recipe, come back, and every
 * check mark is gone with nothing to say it happened. The one moment this
 * application is used with wet hands and half an eye is the one moment it
 * forgot everything.
 *
 * So it is written down, keyed by recipe. Not on the server: this is not
 * something anybody wants synced to their laptop, and a cook who has the page
 * open twice in two rooms is cooking in both.
 *
 * It expires. A recipe you cooked on Sunday should not open on Wednesday with
 * six steps already crossed off — that is worse than forgetting, because it
 * looks like progress you have made. Twelve hours covers a long roast and a
 * short night, and nothing else.
 */

export const COOK_PROGRESS_TTL_MS = 12 * 60 * 60 * 1000;

export interface CookProgress {
    ingredients: number[];
    steps: number[];
    servings: number | null;
    /** When it was last touched, for the expiry above. */
    at: number;
}

export function cookProgressKey(recipeId: number, locale?: string): string {
    // Per language: a translated recipe's lines need not match the
    // original's one for one, and the ticks are kept by position.
    return locale ? `moscookbook:cooking:${recipeId}:${locale}` : `moscookbook:cooking:${recipeId}`;
}

/** Whether a stored record is recent enough to still mean anything. */
export function isFresh(progress: { at: number }, now: number = Date.now()): boolean {
    return now - progress.at < COOK_PROGRESS_TTL_MS && progress.at <= now;
}

/**
 * Reads what is there, or null.
 *
 * Every field is checked rather than trusted: this comes out of storage that a
 * previous version of the application wrote, and a shape that has changed
 * should read as "nothing saved" rather than crash a recipe page.
 */
export function parseCookProgress(raw: string | null, now: number = Date.now()): CookProgress | null {
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;

        const record = parsed as Partial<CookProgress>;
        if (typeof record.at !== 'number' || !isFresh({ at: record.at }, now)) return null;

        const numbers = (value: unknown): number[] =>
            Array.isArray(value) ? value.filter((entry): entry is number => Number.isInteger(entry)) : [];

        return {
            ingredients: numbers(record.ingredients),
            steps: numbers(record.steps),
            servings:
                typeof record.servings === 'number' && record.servings > 0 ? record.servings : null,
            at: record.at,
        };
    } catch {
        return null;
    }
}

/** Whether anything here is worth writing down at all. */
export function worthSaving(progress: Omit<CookProgress, 'at'>, baseServings: number | null): boolean {
    if (progress.ingredients.length > 0 || progress.steps.length > 0) return true;

    // Servings on their own count only when they have been changed from what
    // the recipe says — otherwise every recipe anybody opens leaves a record.
    // A recipe with no servings of its own has nothing to change them from
    // (the page holds 0 there), so nothing to remember either.
    if (baseServings === null || baseServings <= 0) return false;
    return progress.servings !== null && progress.servings !== baseServings;
}
