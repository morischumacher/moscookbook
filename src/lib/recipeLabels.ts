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

/** Per field, when a recipe is written: few enough that the head shows every one (work #44). */
export const MAX_LABELS = 4;
