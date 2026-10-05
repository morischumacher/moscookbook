/**
 * How the cookbook speaks to the cook in German, in every text an AI writes
 * or rewrites (the owner's wish): one voice, the informal imperative — "Gib
 * die Zwiebeln dazu", not "Geben Sie die Zwiebeln dazu" or "Zwiebeln dazugeben".
 * Spelling corrections are left alone: they change nothing but spelling.
 */
export const GERMAN_VOICE = `- German text speaks to the cook informally, in the "du" imperative: "Gib die Zwiebeln dazu",
  "Schneide den Ingwer", "Lass alles 10 Minuten ziehen". Never the polite "Sie" form
  ("Geben Sie …") and never bare infinitives ("Zwiebeln dazugeben"). English text uses
  the plain imperative ("Add the onions").`;

/** Whether a German text is not yet in the du voice: a polite "Sie", or steps ending in an infinitive. */
export function needsVoice(text: string): boolean {
    if (!text.trim()) return false;
    if (/\b\p{L}+(?:en|ern|eln)\s+Sie\b/u.test(text) || /[^.!?:\n]\s(?:Sie|Ihnen|Ihre[nmrs]?)\b/u.test(text)) return true;
    const infinitives = text.split('\n').filter((line) => /\s\p{Ll}+(?:en|ern|eln)\.?\s*$/u.test(line.trim()) && /\s/.test(line.trim()));
    return infinitives.length >= 2;
}

/** A rewrite that changed only the voice: the same numbers, the same steps, about the same length. */
export function sameContent(before: string, after: string): boolean {
    const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join(' ');
    const steps = (text: string) => (text.match(/^\s*\d+\./gm) ?? []).length;
    const ratio = after.length / Math.max(1, before.length);
    return after.trim() !== '' && numbers(before) === numbers(after) && steps(before) === steps(after) && ratio > 0.6 && ratio < 1.6;
}
