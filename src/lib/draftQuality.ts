import type { ImportedRecipe } from './recipeFromHtml';

/**
 * How good is this draft, really?
 *
 * This replaces a test that was binary where the world is graded. The old rule
 * was: a title, at least one ingredient, an instructions field that is not the
 * empty string — and if all three, "ready", and the AI is never asked.
 *
 * That bar is low enough to be nearly meaningless. A recipe page whose markup
 * the parser half-understood can produce the title "Cook Mode", one ingredient
 * called "Servings" and the instruction "Print Recipe", and clear it. It then
 * sits in the inbox labelled ready, and the way you find out is by cooking
 * from it. Meanwhile a page that gave up twelve clean ingredients and eight
 * numbered steps, missing only a description, was sent to a model to be read
 * again — paying to re-read a page that had already been read perfectly.
 *
 * So: a score, from things that can actually be counted.
 *
 * **Every signal here is about shape, not about meaning.** Whether "Zwiebel"
 * is a sensible ingredient is not knowable without a model, and asking a model
 * is the thing being decided — a quality check that costs a call has spent the
 * money it was meant to save. What *is* knowable without one: whether a field
 * is empty, whether it holds a word that is a button rather than food, and
 * whether a list of ingredients carries any quantities at all.
 *
 * **It measures damage, not richness.** This is the correction to the first
 * version of this file, which scored points for having three ingredients, a
 * method over 120 characters and more than one step — and promptly declared
 * "Tomatensuppe: 500 g Tomaten, 1 EL Öl, alles pürieren und erhitzen"
 * unpublishable. That is a complete recipe. It is a *short* recipe, and short
 * is not broken. Ten real tests failed on it, which is the test suite doing
 * exactly its job: the scoring was measuring how elaborate a recipe is, and
 * calling elaborate correct.
 *
 * So the question is not "is there a lot here" but "is any of this wrong":
 * a title that is a button on the page, an ingredient list with "Servings" in
 * it, a method that is the words "Print Recipe". Those are the failures a
 * parser actually produces, and none of them is about length.
 *
 * The verdicts:
 *
 *   good — nothing looks damaged. No model is asked.
 *   thin — it is a recipe, with something visibly wrong. Worth asking.
 *   poor — a field is missing or is page furniture. Worth asking.
 *
 * `thin` and `poor` do the same thing today. They are separate because they
 * read differently in the inbox, and because `poor` is the one where a model's
 * answer should eventually be allowed to *replace* rather than merely fill
 * gaps — a change worth making deliberately rather than discovering.
 */

export type Quality = 'good' | 'thin' | 'poor';

export interface QualityReport {
    quality: Quality;
    /** Damage points. Zero is a clean draft; higher is worse. */
    score: number;
    /** Which checks failed, in plain words. Shown in the inbox, and the reason
     *  this returns a report rather than a number. */
    problems: string[];
}

/**
 * Words that are furniture rather than food.
 *
 * Every one of these has been seen as an "ingredient" or a "title" out of a
 * real recipe site, because they sit inside the same list markup the recipe
 * does. The list is deliberately short and deliberately specific: a generous
 * list would start eating real ingredients, and "Ei" is a substring of a great
 * many German words.
 */
const FURNITURE = [
    'cook mode',
    'print recipe',
    'jump to recipe',
    'rate this recipe',
    'save recipe',
    'servings',
    'portionen',
    'zum rezept',
    'rezept drucken',
    'drucken',
    'merken',
    'bewerten',
    'kommentar',
    'werbung',
    'advertisement',
    'newsletter',
    'us customary',
    'metric',
    'prep time',
    'cook time',
    'total time',
    'nutrition',
    'nährwerte',
];

function isFurniture(value: string): boolean {
    const text = value.trim().toLowerCase();
    if (text === '') return false;

    // Whole-value comparison, not a substring search: "Portionen Feta" is an
    // ingredient and "Portionen" is a label, and only one of them should go.
    return FURNITURE.some((word) => text === word || text === `${word}:`);
}

/**
 * Does this look like a quantity?
 *
 * Not a unit table — a number, a fraction, or one of the handful of words that
 * stand in for one. A table of units is a table that is wrong in whichever
 * language nobody thought of.
 */
const QUANTITY = /(\d|½|¼|¾|⅓|⅔|⅛|\betwas\b|\bnach geschmack\b|\bprise\b|\bto taste\b|\bpinch\b)/i;

function hasQuantity(amount: string, item: string): boolean {
    return QUANTITY.test(amount) || QUANTITY.test(item);
}

/**
 * How many steps does this method have?
 *
 * Counted three ways because three formats arrive: a markdown numbered list, a
 * list of lines, and one paragraph of sentences. The last is the case that
 * matters — a method that is genuinely one long sentence is the thing the
 * "clearer steps" button exists for, and it should count as one step so that
 * it registers as thin.
 */
export function countSteps(instructions: string): number {
    const text = instructions.trim();
    if (text === '') return 0;

    const numbered = text.match(/^\s*\d+[.)]\s+/gm);
    if (numbered && numbered.length > 1) return numbered.length;

    const lines = text.split('\n').filter((line) => line.trim().length > 15);
    if (lines.length > 1) return lines.length;

    // Sentences, roughly. A full stop followed by a capital or a digit; this
    // does not try to be right about "z. B." and does not need to be, since
    // what is being asked is "more than one, or not".
    const sentences = text.split(/[.!?]\s+(?=[A-ZÄÖÜ0-9])/).filter((part) => part.trim().length > 15);
    return Math.max(1, sentences.length);
}

/** A title that is the page rather than the dish. */
function titleProblem(title: string): string | null {
    const text = title.trim();

    if (text === '') return 'no title';
    if (text.length < 3) return 'the title is one or two characters';
    if (/^https?:\/\//i.test(text)) return 'the title is a link';
    if (isFurniture(text)) return 'the title is a button on the page';
    // "Rezept", "Recipe", "Zutaten" on their own: the heading above the recipe
    // rather than the name of it.
    if (/^(rezept|recipe|zutaten|ingredients|zubereitung)s?$/i.test(text)) {
        return 'the title is a heading, not a dish';
    }
    return null;
}

/**
 * The verdict.
 *
 * Damage points, not merit points. Zero is clean, one is a single soft
 * signal, two or more is something structural.
 *
 * The weights are the part of this file most likely to be wrong, because they
 * were chosen against drafts written by hand rather than against drafts from
 * the sites this cookbook actually imports from — which is what
 * `tests/fixtures/` is for, and why it being empty is a real gap rather than a
 * tidiness one.
 */
export function assessDraft(draft: ImportedRecipe): QualityReport {
    const problems: string[] = [];
    let damage = 0;

    /* ----------------------------------------------------------- the title */

    const title = titleProblem(draft.title);
    if (title) {
        problems.push(title);
        damage += 2;
    }

    /* ------------------------------------------------------- the ingredients */

    const real = draft.ingredients.filter(
        (line) => !isFurniture(line.item) && line.item.trim() !== ''
    );

    const furniture = draft.ingredients.length - real.length;

    if (real.length === 0) {
        problems.push('no ingredients');
        damage += 2;
    } else if (furniture > 0) {
        // The parser picked up the page around the list as well as the list.
        // Whatever else it got is suspect.
        problems.push(`${furniture} of the ingredients are page furniture`);
        damage += 1;
    }

    /*
     * Quantities, but only once there are enough of them to mean anything.
     *
     * An ingredient list with no numbers anywhere is usually a paragraph that
     * mentioned food rather than a list of ingredients. With one or two
     * entries that is as likely to be "Salz" and "Pfeffer", which never carry
     * a quantity and are not a problem.
     */
    if (real.length >= 3) {
        const withQuantity = real.filter((line) => hasQuantity(line.amount, line.item)).length;
        if (withQuantity === 0) {
            problems.push('no ingredient has a quantity');
            damage += 2;
        } else if (withQuantity / real.length < 0.4) {
            problems.push('most ingredients have no quantity');
            damage += 1;
        }
    }

    /* ------------------------------------------------------ the instructions */

    const instructions = draft.instructions.trim();

    if (instructions === '') {
        problems.push('no method');
        damage += 2;
    } else if (isFurniture(instructions)) {
        problems.push('the method is a button on the page');
        damage += 2;
    } else if (instructions.length < 15) {
        /*
         * Fifteen, and the first draft of this said forty.
         *
         * Forty was reasoning about what a *good* method looks like, which is
         * the mistake this whole file was rewritten to stop making. "Alles
         * pürieren und erhitzen." is twenty-eight characters and is a
         * complete instruction for a tomato soup; three tests said so.
         *
         * Fifteen is not a judgement about methods at all. It is a floor under
         * which a string cannot be a sentence in any language — "Drucken",
         * "Print Recipe", "Mehr" — and those are what this catches. The
         * named ones are caught by the furniture list already; this is for the
         * ones nobody has seen yet.
         */
        problems.push('the method is a label, not a method');
        damage += 1;
    }

    return {
        score: damage,
        problems,
        quality: damage === 0 ? 'good' : damage === 1 ? 'thin' : 'poor',
    };
}

/**
 * Should a model be asked about this?
 *
 * Kept as its own function, taking a report rather than a draft, so that the
 * *measuring* and the *deciding* can be read apart. They change for different
 * reasons: the measuring changes when a site starts producing a new kind of
 * rubbish, the deciding changes when somebody's view of what an import is
 * worth paying for changes.
 */
export function worthAsking(report: QualityReport): boolean {
    return report.quality !== 'good';
}
