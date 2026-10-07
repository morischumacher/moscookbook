import { unitOf, unitSpelling, isCountUnit } from './units';

/**
 * The units the ingredient editor offers, as a fixed list — with "your own"
 * for everything else ("Dose", "Bund", "kleine").
 *
 * An amount stays one piece of text in storage ("200 g", "2 EL"); the editor
 * splits it into a number and one of these, and joins them again. What is
 * read from an import is matched to the list where it can be, and can be
 * changed afterwards (the owner's wish).
 */
// European only (the owner's wish): grams and millilitres, spoons, and the
// counted units a German kitchen uses. A cup or an ounce from an import is
// kept as written, under "Eigene …".
export const UNIT_CHOICES = ['', 'g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'pinch', 'clove', 'bunch'] as const;
export type UnitChoice = (typeof UNIT_CHOICES)[number] | 'custom';

export interface AmountFields {
    /** As typed: "200", "1 1/2", "2-3", "ca. 200". */
    quantity: string;
    choice: UnitChoice;
    /** The unit in words, for `custom`. */
    custom: string;
}

const NUMBER = '[\\d½¼¾⅓⅔⅛⅜⅝⅞]+(?:[.,/]\\d*)?';
const QUANTITY = new RegExp(
    `^\\s*((?:ca\\.|circa|etwa|ungefähr|about|approx\\.?|~)?\\s*${NUMBER}(?:\\s+${NUMBER})?(?:\\s*[-–]\\s*(?:${NUMBER})?)?)\\s*(.*)$`,
    'i'
);

/** The choice for a written unit: one on the list, or "custom". */
export function choiceFor(unit: string): UnitChoice {
    const text = unit.trim();
    if (text === '') return '';
    const def = unitOf(text);
    if (def && (UNIT_CHOICES as readonly string[]).includes(def.id)) return def.id as UnitChoice;
    if (isCountUnit(text)) {
        const lower = text.toLowerCase();
        if (/^(prise|prisen|pinch|pinches)$/.test(lower)) return 'pinch';
        if (/^(zehe|zehen|clove|cloves)$/.test(lower)) return 'clove';
        if (/^(bund|bunde|bünde|bunch|bunches)$/.test(lower)) return 'bunch';
    }
    return 'custom';
}

/** "200 g" → 200 and g; "1 kleine Dose" → 1 and "kleine Dose"; "etwas" → nothing and "etwas". */
export function splitForEditor(amount: string): AmountFields {
    // "7 bis 8", "2 to 3": a range, as the stored amount reads it — not a unit called "bis 8".
    const text = amount.trim().replace(/^((?:ca\.|circa|etwa|about|~)?\s*[\d½¼¾⅓⅔⅛⅜⅝⅞]+(?:[.,/]\d+)?)\s+(?:bis|to)\s+(?=[\d½¼¾⅓⅔])/i, '$1-');
    const match = QUANTITY.exec(text);
    const quantity = match ? match[1].trim() : '';
    const rest = match ? match[2].trim() : text;
    const choice = choiceFor(rest);
    return { quantity, choice, custom: choice === 'custom' ? rest : '' };
}

/** The unit's word in the form, as it is stored: "EL", "Tassen", "cups". */
export function choiceLabel(choice: UnitChoice, locale: 'de' | 'en', plural = false): string {
    if (choice === '' || choice === 'custom') return '';
    const word = choice === 'pinch' ? 'Prise' : choice === 'clove' ? 'Zehe' : choice === 'bunch' ? 'Bund' : choice;
    return unitSpelling(word, plural ? 2 : 1, locale) ?? choice;
}

/** The two halves joined again into what is stored. */
export function joinFromEditor(fields: AmountFields, locale: 'de' | 'en'): string {
    const plural = !/^\s*(?:ca\.\s*|about\s*)?(?:1|½|¼|¾|⅓|⅔|0[.,]\d+)\s*$/i.test(fields.quantity) && fields.quantity.trim() !== '';
    // A unit with no number is no amount ("EL Ingwer"); "Prise" reads on its own.
    if (!fields.quantity.trim() && fields.choice !== 'custom' && fields.choice !== 'pinch') return '';
    const unit = fields.choice === 'custom' ? fields.custom.trim() : choiceLabel(fields.choice, locale, plural);
    return [fields.quantity.trim(), unit].filter(Boolean).join(' ');
}
