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

export const MAX_LABELS = 5;

/**
 * What the head of a recipe shows: the first few, and how many more there
 * are — a recipe filed under nine categories must not push its own title off
 * the screen.
 */
export function headLabels(labels: string[], shown = 3): { shown: string[]; more: number } {
    return { shown: labels.slice(0, shown), more: Math.max(0, labels.length - shown) };
}
