'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { splitAmount, formatAmount } from '@/lib/ingredientParts';
import { formatShape, shapeOf } from '@/lib/ingredientShape';
import { matchIn, similarIn, type MatchableItem } from '@/lib/ingredientMatch';
import { convertQuantity, familyOf, isEuropean, measureOf, perUnit, conversionText, rebased, storedFactor, unitFits, unitKey, unitLabel } from '@/lib/ingredientUnits';
import type { Units } from '@/lib/shoppingParts';

export interface FormCatalogItem extends MatchableItem {
    /** Its main unit ('g', 'bunch', '' for pieces), or null with none yet. */
    unit: string | null;
    moreUnits: string[];
    units: Units | null;
}

/** What the AI answered for one row (lib/ingredientDecideDb aiRow). */
export interface RowAnswer {
    choice?: number | null;
    factor?: number | null;
    keep?: boolean;
}

/**
 * Where an ingredient row of the recipe form stands with the ingredient list,
 * in one of three colours — the same two questions as on admin → Zutaten,
 * asked right at the row, with every name in the recipe's own language:
 *
 * - green: a card we have, in a unit it lists (TL beside EL is fine);
 * - amber, "the same ingredient?": similar cards — take one, rename that one
 *   to this name, or add this as a new one; or let the AI decide;
 * - amber, "a new unit?": convert the row to the main unit, add the unit to
 *   the card (with its conversion), make it the main unit, call it another
 *   ingredient — or let the AI decide;
 * - blue: nothing like it yet — saving adds a new card.
 */
export default function IngredientHint({
    item,
    amount,
    catalog,
    language,
    keptNew,
    aiAvailable,
    onItem,
    onAmount,
    onKeepNew,
    onKeepUnit,
    onRename,
    onOverwriteName,
    onOverwriteUnit,
    onAi,
}: {
    item: string;
    amount: string;
    catalog: FormCatalogItem[];
    /** The recipe's language: what every name and unit is shown in. */
    language: 'de' | 'en';
    /** "Add as new ingredient" was tapped for this name. */
    keptNew: boolean;
    aiAvailable: boolean;
    onItem: (next: string) => void;
    onAmount: (next: string) => void;
    onKeepNew: () => void;
    /** The row's unit added to the card: "a unit = b main". */
    onKeepUnit: (id: number, unit: string, a: number, b: number) => void;
    /** "Another ingredient": back into the name field, to call it something else. */
    onRename: () => void;
    /** The card we have renamed to this row's name — in every recipe. */
    onOverwriteName: (id: number, name: string) => void;
    /** This row's unit made the card's main unit. */
    onOverwriteUnit: (id: number, unit: string) => void;
    onAi: (question: object) => Promise<RowAnswer | null>;
}) {
    const t = useTranslations('RecipeForm');
    const [asking, setAsking] = useState(false);
    const name = item.trim();
    const known = name.length >= 3 && !name.startsWith('#') ? matchIn(name, catalog) : null;
    const parts = splitAmount(amount);
    const written = parts.unit ?? '';
    const proposal = known && known.unit !== null ? perUnit(unitKey(written), known.unit, known.units) : null;
    const start = proposal ? conversionText(unitKey(written), known!.unit!, proposal, language) : null;
    const [a, setA] = useState(start ? String(start.a) : '1');
    const [b, setB] = useState(start ? String(start.b).replace('.', ',') : '');
    if (catalog.length === 0 || name.length < 3 || name.startsWith('#')) return null;

    const nameOf = (entry: MatchableItem) => (language === 'de' ? entry.de || entry.en : entry.en || entry.de);
    const chip = 'min-h-9 rounded-full border border-control px-3 text-xs text-ink hover:border-ink disabled:opacity-50';
    const status = (tone: 'success' | 'warning' | 'info', text: string) => (
        <span className={`inline-flex items-center gap-1.5 font-medium ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-info'}`}>
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-current" />
            {text}
        </span>
    );
    const ai = async (question: object, apply: (answer: RowAnswer) => void) => {
        setAsking(true);
        const answer = await onAi(question);
        setAsking(false);
        if (answer) apply(answer);
    };
    const aiButton = (question: object, apply: (answer: RowAnswer) => void) => (
        <button type="button" disabled={!aiAvailable || asking} title={aiAvailable ? undefined : t('hintNoAi')} onClick={() => void ai(question, apply)} className={chip}>
            {asking ? t('hintAsking') : t('hintAi')}
        </button>
    );

    if (!known) {
        const alike = keptNew ? [] : similarIn(name, catalog);
        if (alike.length === 0) {
            return (
                <div className="basis-full text-xs" role="note">
                    {status('info', t('hintNew'))} <span className="text-muted">{t('hintNewExplain')}</span>
                </div>
            );
        }
        const take = (entry: MatchableItem) => onItem(formatShape({ ...shapeOf(name), base: nameOf(entry) }));
        return (
            <div className="basis-full text-xs text-muted" role="note">
                {status('warning', t('hintAlike'))}
                <span className="mt-1 flex flex-wrap items-center gap-2">
                    {alike.map((entry) => (
                        <button key={entry.id} type="button" onClick={() => take(entry)} className={chip}>
                            {t('hintTake', { name: nameOf(entry) })}
                        </button>
                    ))}
                    {/* The closest one overwritten with this name: "Nudeln" becomes "Pasta", in every recipe. */}
                    <button type="button" onClick={() => onOverwriteName(alike[0].id, shapeOf(name).base)} className={chip}>
                        {t('hintOverwriteName', { old: nameOf(alike[0]), name: shapeOf(name).base })}
                    </button>
                    <button type="button" onClick={onKeepNew} className={chip}>
                        {t('hintKeepNew')}
                    </button>
                    {aiButton({ kind: 'alike', name, options: alike.map((entry) => ({ id: entry.id, name: `${entry.de} | ${entry.en}` })) }, (answer) => {
                        const chosen = alike.find((entry) => entry.id === answer.choice);
                        if (chosen) take(chosen);
                        else if (answer.choice === null) onKeepNew();
                    })}
                </span>
            </div>
        );
    }

    // Known: is the row's unit one its card lists?
    const showUnit = written ? unitLabel(unitKey(written), language) : known.unit !== null ? unitLabel(known.unit, language) : '';
    if (known.unit === null || (parts.quantity === null && !parts.unit) || unitFits(known, written)) {
        const main = known.unit !== null && written && familyOf(measureOf(written)) !== null && unitKey(written) !== known.unit ? unitLabel(known.unit, language) : null;
        return (
            <div className="basis-full text-xs" role="note">
                {status(
                    'success',
                    showUnit
                        ? main
                            ? t('hintKnownUnitMain', { name: nameOf(known), unit: showUnit, main })
                            : t('hintKnownUnit', { name: nameOf(known), unit: showUnit })
                        : t('hintKnown', { name: nameOf(known) })
                )}
            </div>
        );
    }

    const main = known.unit;
    const mainLabel = unitLabel(main, language);
    const rowUnit = unitKey(written);
    // The row's own unit, "Stück" for none — not the main unit the green line falls back to.
    const rowLabel = unitLabel(rowUnit, language);
    const number = (text: string) => Number(text.replace(',', '.'));
    const ready = number(a) > 0 && number(b) > 0;
    // The row in the main unit, with the conversion as written above it.
    const convert = (one: number, other: number) => {
        const stored = storedFactor(rowUnit, one, main, other);
        const mainMeasure = measureOf(main)!;
        const units: Units = { ...(known.units ? rebased(known.units, mainMeasure) : { buy: mainMeasure, factors: {} }) };
        if (stored) units.factors = { ...units.factors, [stored.measure]: stored.factor };
        const quantity = parts.quantity === null ? null : convertQuantity(parts.quantity, written, main, units);
        const quantityMax = parts.quantityMax === null ? null : convertQuantity(parts.quantityMax, written, main, units);
        if (quantity === null) return;
        onAmount(formatAmount({ quantity, quantityMax, unit: main === '' ? null : unitLabel(main, language, (quantityMax ?? quantity) > 1) }, 1, language));
    };
    const field = 'w-16 rounded-lg border border-control bg-transparent px-2 py-1 text-base text-ink outline-none focus:border-ink';
    return (
        <div className="basis-full text-xs text-muted" role="note">
            {status('warning', t('hintUnitQuestion', { name: nameOf(known), unit: rowLabel, main: mainLabel }))}
            <span className="mt-1 flex flex-wrap items-center gap-2">
                <input value={a} onChange={(event) => setA(event.target.value)} inputMode="decimal" aria-label={t('hintConvA', { unit: rowLabel })} className={field} />
                <span>{rowLabel} =</span>
                <input value={b} onChange={(event) => setB(event.target.value)} inputMode="decimal" placeholder="?" aria-label={t('hintConvB', { unit: mainLabel })} className={field} />
                <span>{mainLabel}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
                <button type="button" disabled={!ready} onClick={() => convert(number(a), number(b))} className={chip}>
                    {t('hintConvertTo', { unit: mainLabel })}
                </button>
                {isEuropean(rowUnit) && (
                    <button type="button" disabled={!ready} onClick={() => onKeepUnit(known.id, rowUnit, number(a), number(b))} className={chip}>
                        {t('hintKeepUnit', { unit: rowLabel })}
                    </button>
                )}
                {isEuropean(rowUnit) && (
                    <button type="button" onClick={() => onOverwriteUnit(known.id, rowUnit)} className={chip}>
                        {t('hintOverwriteUnit', { unit: rowLabel })}
                    </button>
                )}
                <button type="button" onClick={onRename} className={chip}>
                    {t('hintOther')}
                </button>
                {aiButton({ kind: 'unit', name: nameOf(known), main, unit: rowUnit, amount }, (answer) => {
                    if (!answer.factor) return;
                    const [one, other] = answer.factor >= 1 ? [1, Math.round(answer.factor * 100) / 100] : [Math.round((1 / answer.factor) * 100) / 100, 1];
                    setA(String(one));
                    setB(String(other).replace('.', ','));
                    if (answer.keep && isEuropean(rowUnit)) onKeepUnit(known.id, rowUnit, one, other);
                    else convert(one, other);
                })}
            </span>
            {!ready && <span className="mt-1 block text-faint">{t('hintConvMissing')}</span>}
        </div>
    );
}
