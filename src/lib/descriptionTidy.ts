import { withoutPlatformWrapper } from './pageTitle';
import { coreName } from './ingredientMatch';

/**
 * A recipe's description as a description: a sentence or two about the dish.
 *
 * An Instagram or TikTok page puts its whole caption into og:description —
 * "150.000 Likes, 465 Kommentare - derekkchen am 29. März 2024: "Sesam-Nudeln
 * Zutaten Sauce * 3 EL Sesampaste … #sesamnudeln #rezept"" — and that came
 * into the description of imported recipes: the counters, the account, the
 * ingredients and the method a second time, and the hashtags. Here the
 * wrapping is taken off, and a caption that is the recipe itself (its
 * ingredients, "Zutaten", "Anleitung") leaves no description at all — the
 * recipe is already in its fields.
 */

/** "150.000 Likes, 465 Kommentare - derekkchen am 29. März 2024: " / "12K likes, 80 comments - x on March 2, 2024: ". */
const COUNTERS = /^\s*[\d.,]+\s*[KkMm]?\s+(?:likes?|gefällt|mal|„gefällt)[^:]{0,160}:\s*/i;
/** Hashtags at the end, with what closes the caption after them. */
const TRAILING_TAGS = /(?:\s*#[\p{L}\p{N}_]+)+[\s"“”'.]*$/u;
const RECIPE_WORDS = /\b(?:zutaten|ingredients|anleitung|zubereitung|instructions|method|directions)\b/i;

export function tidyDescription(description: string, ingredients: { item: string }[] = []): string {
    let text = description.trim();
    if (!text) return '';
    text = text.replace(COUNTERS, '');
    text = withoutPlatformWrapper(text);
    text = text.replace(TRAILING_TAGS, '').trim();
    // The caption's own quotation marks, now that what was around them is gone.
    text = text.replace(/^["“„]+/, '').replace(/["“”]+\.?$/, '').trim();
    if (!text) return '';

    // The recipe itself rather than words about it: its ingredients named in it, or its headings.
    const lower = text.toLowerCase();
    const names = [...new Set(ingredients.map((row) => coreName(row.item).toLowerCase()).filter((name) => name.length >= 4))];
    const named = names.filter((name) => lower.includes(name)).length;
    if (named >= 3 || (RECIPE_WORDS.test(text) && text.length > 160)) return '';
    return text;
}
