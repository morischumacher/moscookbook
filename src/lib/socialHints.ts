/**
 * Where a post says its recipe is, when it is not in the post.
 *
 * "Rezept in der Bio", "recipe in the comments", "comment PASTA and I'll DM
 * you the recipe". None of these can be followed from a server: the bio and
 * the comments are behind Instagram's login, and a DM is sent by a bot to
 * whoever commented. What can be done is to say so — in the inbox, with the
 * one thing that works for each — instead of "only part of a recipe".
 */

export type RecipeElsewhere = 'bio' | 'comments' | 'dm';

/** "Comment PASTA and I'll send you the recipe" — a bot, answering by DM. */
const BY_DM = [
    /\b(kommentier\w*|comment|schreib\w*)\b[^.\n]{0,40}\b(dm|dms|direktnachricht|nachricht|message|inbox|send|schick\w*)\b/i,
    /\b(rezept|recipe)\b[^.\n]{0,25}\b(per|via|by|in (your|deine|die))\s+(dm|direktnachricht|nachricht|message)\b/i,
];

const IN_COMMENTS = [
    /\b(rezept|recipe|zutaten|ingredients)\b[^.\n]{0,40}\b(kommentar\w*|comments?)\b/i,
    /\b(kommentar\w*|comments?)\b[^.\n]{0,20}\b(rezept|recipe)\b/i,
];

const IN_BIO = [/\blink\s*in\s*(der|meiner|my|the)?\s*bio\b/i, /\b(link|rezept\w*|recipes?)\b[^.\n]{0,30}\b(bio|profil|profile)\b/i, /linkin\.bio|linktr\.ee/i];

export function recipeElsewhere(text: string): RecipeElsewhere | null {
    if (BY_DM.some((pattern) => pattern.test(text))) return 'dm';
    if (IN_COMMENTS.some((pattern) => pattern.test(text))) return 'comments';
    if (IN_BIO.some((pattern) => pattern.test(text))) return 'bio';
    return null;
}
