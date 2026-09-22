import { z } from 'zod';
import type { AiKey } from './aiImport';
import { scrub } from './secretBox';

/**
 * Two things the AI may do to text a person has already written.
 *
 * This is a different kind of asking from the import, and the difference is
 * the whole design. An import reads something nobody wrote here and produces a
 * draft; getting it wrong loses nothing, because there was nothing. These two
 * are pointed at **words somebody typed**, and getting those wrong quietly is
 * the worst outcome available: a recipe that no longer says what its author
 * meant, in a cookbook whose entire value is that it holds what they meant.
 *
 * So three rules, enforced here rather than trusted to a prompt:
 *
 *   1. **Nothing is applied automatically.** Every call returns the new text
 *      next to the old one and the person presses a button. There is no path
 *      through this module that writes to a recipe.
 *   2. **Numbers are checked afterwards.** A model asked to tidy prose will
 *      round "18–20 Minuten" to "20 Minuten" perhaps one time in fifty, which
 *      is exactly often enough never to be noticed. Every number in the
 *      original must still be in the result, or the result is refused.
 *   3. **The language is never changed.** A German recipe tidied into English
 *      is not a tidied recipe.
 *
 * Rule 2 is the one worth having. It is cheap, it is mechanical, and it
 * catches the failure that a human proof-reader also misses.
 */

export type PolishMode = 'spelling' | 'steps';

/**
 * Orthography only.
 *
 * Written as a list of refusals rather than a list of goals, because the
 * failure here is always the model being *helpful*: it tidies the phrasing, it
 * makes the steps parallel, it decides "Zwiebel" should be "Zwiebeln". Each of
 * those is an improvement to a text nobody asked it to improve, and each one
 * puts words in somebody's mouth.
 */
const SPELLING_PROMPT = `You are a proof-reader for a personal cookbook.

Correct ONLY these, and return the corrected text:
- misspellings and typing errors
- wrong or missing punctuation and capitalisation
- doubled words ("die die"), missing spaces, stray characters

Change NOTHING else. Specifically, you must NOT:
- rephrase, shorten, expand, or reorder anything
- change the wording of a sentence that is merely informal or clumsy
- translate, or change the language in any way
- change any number, quantity, unit, temperature or time
- change an ingredient's name, even to a more standard one
- add, remove, merge or split steps, sentences or list items
- change the formatting: keep every line break, blank line, list marker,
  heading and markdown character exactly where it is
- add a comment, a heading, a note, or any text of your own

If the text has no errors, return it completely unchanged.
Return ONLY the corrected text, with no explanation and no code fences.`;

/**
 * Turning a paragraph into steps somebody can cook from.
 *
 * This one is allowed to rewrite, which is the point — what arrives from a
 * forwarded e-mail or a video description is one long paragraph, and a method
 * is a sequence. What it is still not allowed to do is *know* anything: every
 * time, temperature and quantity has to come from the text, because a model
 * filling in "etwa 20 Minuten" for a step that never had a time is inventing a
 * recipe and presenting it as somebody's own.
 */
const STEPS_PROMPT = `You rewrite the method of a recipe so it can be cooked from.

Turn the text into a numbered markdown list, one step per item, separated by
blank lines. Each step is one action or a few that belong together, written as
an instruction ("Die Zwiebel würfeln und anschwitzen.").

You MAY:
- split a long sentence into separate steps, and merge two fragments that are
  one action
- put the steps in the order the text implies, if it is out of order
- remove chatter that is not part of the method: greetings, "viel Spaß",
  requests to subscribe, links, advertising, repeated ingredient lists
- tighten wording so a step reads as an instruction

You MUST NOT:
- invent, estimate or add any time, temperature, quantity, pan size or
  ingredient that is not in the text. If the text does not say how long
  something takes, the step does not say either.
- drop any instruction, warning or tip that is part of the method
- change any number, unit or ingredient name that is in the text
- translate, or change the language in any way
- add a heading, an introduction, a closing line, or a note of your own

Return ONLY the numbered list, with no explanation and no code fences.`;

const PROMPTS: Record<PolishMode, string> = {
    spelling: SPELLING_PROMPT,
    steps: STEPS_PROMPT,
};

/**
 * Every number in a text, normalised enough to compare.
 *
 * Decimal commas and points are the same number here, because a model tidying
 * German prose may well write 1.5 where the author wrote 1,5 — which is a
 * formatting change, not a changed quantity. Fractions are kept as written:
 * ½ becoming 0.5 is also fine, so both forms are counted as present.
 */
export function numbersIn(text: string): string[] {
    const found = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) =>
        value.replace(',', '.').replace(/\.0+$/, '')
    );
    return found.sort();
}

/**
 * Did the rewrite keep every number?
 *
 * One direction only. A step list that *drops* "180" has lost the oven
 * temperature; one that gained a number it did not have is caught by the same
 * comparison, since the multisets must match exactly.
 */
export function keepsNumbers(before: string, after: string): boolean {
    const a = numbersIn(before);
    const b = numbersIn(after);

    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
}

export interface PolishResult {
    ok: true;
    text: string;
    /** True when nothing needed changing — the screen says so rather than
     *  offering a button that does nothing. */
    unchanged: boolean;
}

export interface PolishFailure {
    ok: false;
    reason: 'no-keys' | 'refused' | 'numbers-changed' | 'error';
    message: string;
}

/**
 * The prompt is sent through the same provider chain as the import, so a
 * person with two keys gets the same fallback here.
 *
 * The import's own extractor is not reused: that one asks for a whole recipe as
 * JSON, and what is wanted here is a piece of text. Sharing the chain and not
 * the schema is deliberate — a "polish" that came back as a recipe object
 * would be a rewrite of the whole recipe wearing a small button.
 */
export async function polish(
    mode: PolishMode,
    text: string,
    keys: AiKey[],
    call: (key: AiKey, system: string, user: string) => Promise<string>
): Promise<PolishResult | PolishFailure> {
    if (keys.length === 0) {
        return { ok: false, reason: 'no-keys', message: 'No AI key is configured.' };
    }

    const failures: string[] = [];

    for (const key of keys) {
        try {
            const answer = (await call(key, PROMPTS[mode], text)).trim();

            if (answer === '') {
                failures.push('an empty answer');
                continue;
            }

            // A model that decided to explain itself rather than do the work.
            // Cheap to spot: the answer is enormously longer than the input.
            if (answer.length > text.length * 3 + 500) {
                failures.push('an answer that was not the text');
                continue;
            }

            if (!keepsNumbers(text, answer)) {
                return {
                    ok: false,
                    reason: 'numbers-changed',
                    message:
                        'The suggestion changed a number, so it was discarded. Nothing has been altered.',
                };
            }

            return { ok: true, text: answer, unchanged: answer === text.trim() };
        } catch (error) {
            failures.push(
                scrub(error instanceof Error ? error.message : String(error), key.apiKey)
            );
        }
    }

    return { ok: false, reason: 'error', message: failures.join(' · ').slice(0, 300) };
}

export const polishSchema = z.object({
    mode: z.enum(['spelling', 'steps']),
    // A recipe's method, not a novel. Anything longer is somebody pasting a
    // book in, and the button is not for that.
    text: z.string().trim().min(1).max(20_000),
});
