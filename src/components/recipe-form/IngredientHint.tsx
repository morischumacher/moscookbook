'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { splitAmount, formatAmount } from '@/lib/ingredientParts';
import { formatShape, shapeOf } from '@/lib/ingredientShape';
import { matchIn, similarIn, type MatchableItem } from '@/lib/ingredientMatch';
import { convertQuantity, familyOf, isEuropean, measureOf, perUnit, conversionText, rebased, storedFactor, unitFits, unitKey, unitLabel } from '@/lib/ingredientUnits';
import type { Units } from '@/lib/shoppingParts';
import { toMetric } from '@/lib/units';
import { shoppingKey } from '@/lib/shopping';

export interface FormCatalogItem extends MatchableItem {
    /** Its main unit ('g', 'bunch', '' for pieces), or null with none yet. */
    unit: string | null;
    moreUnits: string[];
    units: Units | null;
    /** What it is, per language ("Koreanisches Chilipulver"); null or '' for none. */
    infoDe?: string | null;
    infoEn?: string | null;
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
    onGiveName,
    onInfo,
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
    /** This row's name given to a card that has none in this language yet: "the German version of …". */
    onGiveName: (id: number, name: string) => void;
    /** The card's explanation in this language changed (shown beside it in every recipe). */
    onInfo?: (id: number, info: string) => void;
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
    const chip = 'min-h-9 rounded-full border border-control bg-page px-3 text-xs text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40';
    // An amber question sits in a box of its own, so its answers read as one group under the row.
    const box = 'basis-full rounded-xl border border-line bg-surface p-3 text-xs text-muted';
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

    // Cards with no name in this language yet: a new name here may be one of them, in this language.
    const otherLanguage = language === 'de' ? 'en' : 'de';
    const halfCards = catalog.filter((entry) => !entry[language] && entry[otherLanguage]).sort((a, b) => a[otherLanguage].localeCompare(b[otherLanguage]));
    const versionOf =
        halfCards.length > 0 ? (
            <label className="mt-2 flex flex-wrap items-center gap-2 text-muted">
                {t(language === 'de' ? 'hintGermanOf' : 'hintEnglishOf')}
                <select
                    value=""
                    onChange={(event) => event.target.value && onGiveName(Number(event.target.value), shapeOf(name).base)}
                    className="min-h-9 max-w-full rounded-lg border border-control bg-page px-2 text-xs text-ink"
                >
                    <option value="">{t('hintChoose')}</option>
                    {halfCards.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                            {entry[otherLanguage]}
                        </option>
                    ))}
                </select>
            </label>
        ) : null;

    if (!known) {
        const alike = keptNew ? [] : similarIn(name, catalog);
        if (alike.length === 0) {
            return (
                <div className="basis-full text-xs" role="note">
                    {status('info', t('hintNew'))} <span className="text-muted">{t('hintNewExplain')}</span>
                    {versionOf}
                </div>
            );
        }
        const take = (entry: MatchableItem) => onItem(formatShape({ ...shapeOf(name), base: nameOf(entry) }));
        const base = shapeOf(name).base;
        const otherName = (entry: MatchableItem) => (language === 'de' ? entry.en : entry.de);
        return (
            <div className={box} role="note">
                {status('warning', t('hintAlike'))}
                {/* Each look-alike on its line, with both of its answers: take it, or rename it to this name. */}
                <ul className="mt-2 divide-y divide-line">
                    {alike.map((entry) => (
                        <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span className="text-sm text-ink">
                                {nameOf(entry)}
                                {otherName(entry) && <span className="text-muted"> · {otherName(entry)}</span>}
                            </span>
                            <span className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => take(entry)} className={chip}>
                                    {t('hintTakeShort')}
                                </button>
                                <button type="button" onClick={() => onOverwriteName(entry.id, base)} className={chip}>
                                    {t('hintRenameTo', { name: base })}
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
                {versionOf}
                <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-2">
                    <button type="button" onClick={onKeepNew} className={chip}>
                        {t('hintKeepNew')}
                    </button>
                    {aiButton({ kind: 'alike', name, options: alike.map((entry) => ({ id: entry.id, name: `${entry.de} | ${entry.en}` })) }, (answer) => {
                        const chosen = alike.find((entry) => entry.id === answer.choice);
                        if (chosen) take(chosen);
                        else if (answer.choice === null) onKeepNew();
                    })}
                </div>
            </div>
        );
    }

    // "cups", "oz": not a European unit — converted with plain arithmetic, no card needed (lib/units toMetric).
    if (known && parts.quantity !== null && written && !isEuropean(unitKey(written))) {
        const metric = toMetric(parts, name, language);
        const converted = metric.unit !== parts.unit ? formatAmount(metric, 1, language) : null;
        return (
            <div className={box} role="note">
                {status('warning', t('hintNotEuropean', { unit: written }))}
                {converted && (
                    <div className="mt-2">
                        <button type="button" onClick={() => onAmount(converted)} className={chip}>
                            {t('hintConvertMetric', { amount: converted })}
                        </button>
                    </div>
                )}
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
                {onInfo && <InfoLine key={known.id} info={(language === 'de' ? known.infoDe : known.infoEn) ?? ''} onSave={(info) => onInfo(known.id, info)} />}
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
    const field = 'w-16 rounded-lg border border-control bg-page px-2 py-1 text-base text-ink outline-none focus:border-ink';
    const group = 'mt-2 flex flex-wrap items-center gap-2';
    const groupLabel = 'w-full text-faint sm:w-24';
    return (
        <div className={box} role="note">
            {status('warning', t('hintUnitQuestion', { name: nameOf(known), unit: rowLabel, main: mainLabel }))}
            {/* The conversion first: both "convert this row" and "add the unit" need it. */}
            <div className={group}>
                <span className={groupLabel}>{t('hintConversion')}</span>
                <input value={a} onChange={(event) => setA(event.target.value)} inputMode="decimal" aria-label={t('hintConvA', { unit: rowLabel })} className={field} />
                <span className="text-ink">{rowLabel} =</span>
                <input value={b} onChange={(event) => setB(event.target.value)} inputMode="decimal" placeholder="?" aria-label={t('hintConvB', { unit: mainLabel })} className={field} />
                <span className="text-ink">{mainLabel}</span>
                {!ready && <span className="text-faint">{t('hintConvMissing')}</span>}
            </div>
            <div className={group}>
                <span className={groupLabel}>{t('hintThisRow')}</span>
                <button type="button" disabled={!ready} onClick={() => convert(number(a), number(b))} className={chip}>
                    {t('hintConvertTo', { unit: mainLabel })}
                </button>
                <button type="button" onClick={onRename} className={chip}>
                    {t('hintOther')}
                </button>
            </div>
            {isEuropean(rowUnit) && (
                <div className={group}>
                    <span className={groupLabel}>{t('hintTheCard')}</span>
                    <button type="button" disabled={!ready} onClick={() => onKeepUnit(known.id, rowUnit, number(a), number(b))} className={chip}>
                        {t('hintKeepUnit', { unit: rowLabel })}
                    </button>
                    <button type="button" onClick={() => onOverwriteUnit(known.id, rowUnit)} className={chip}>
                        {t('hintOverwriteUnit', { unit: rowLabel })}
                    </button>
                </div>
            )}
            <div className="mt-2 border-t border-line pt-2">
                {aiButton({ kind: 'unit', name: nameOf(known), main, unit: rowUnit, amount }, (answer) => {
                    if (!answer.factor) return;
                    const [one, other] = answer.factor >= 1 ? [1, Math.round(answer.factor * 100) / 100] : [Math.round((1 / answer.factor) * 100) / 100, 1];
                    setA(String(one));
                    setB(String(other).replace('.', ','));
                    if (answer.keep && isEuropean(rowUnit)) onKeepUnit(known.id, rowUnit, one, other);
                    else convert(one, other);
                })}
            </div>
        </div>
    );
}

export type RowTone = 'success' | 'warning' | 'info';

/**
 * A row's colour, as the hint draws it: green (a card, in a unit it lists),
 * amber (a similar card, or another unit), blue (new) — for the
 * translation to mirror (MirrorHint). Null for a heading or a row too short to say.
 */
export function rowStatus(item: string, amount: string, catalog: FormCatalogItem[]): { tone: RowTone | null; card: FormCatalogItem | null } {
    const name = item.trim();
    if (catalog.length === 0 || name.length < 3 || name.startsWith('#')) return { tone: null, card: null };
    const known = matchIn(name, catalog);
    if (!known) return { tone: similarIn(name, catalog).length > 0 ? 'warning' : 'info', card: null };
    const parts = splitAmount(amount);
    const written = parts.unit ?? '';
    if (parts.quantity !== null && written && !isEuropean(unitKey(written))) return { tone: 'warning', card: known };
    if (known.unit === null || (parts.quantity === null && !parts.unit) || unitFits(known, written)) return { tone: 'success', card: known };
    return { tone: 'warning', card: known };
}

/**
 * A translation's row, in the colour of the original's row beside it: the
 * same ingredient, decided once — above, in the original. Green names the
 * card in this language (or offers this row's name to a card that has none
 * in it yet); amber and blue point to the original.
 */
export function MirrorHint({
    tone,
    card,
    item,
    source,
    language,
    onGiveName,
    onItem,
    onJump,
}: {
    tone: RowTone | null;
    card: FormCatalogItem | null;
    item: string;
    /** The original's row this one is paired with ("Salt"): named, so a wrong pair shows. */
    source: string;
    language: 'de' | 'en';
    onGiveName: (id: number, name: string) => void;
    /** This row's name changed (to the card's name in this language). */
    onItem: (next: string) => void;
    /** To the original's row, where an open question is answered. */
    onJump: () => void;
}) {
    const t = useTranslations('RecipeForm');
    if (!tone) return null;
    const chip = 'min-h-9 rounded-full border border-control bg-page px-3 text-xs text-ink hover:border-ink';
    const color = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-info';
    const line = (text: string) => (
        <span className={`inline-flex items-center gap-1.5 font-medium ${color}`}>
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-current" />
            {text}
        </span>
    );
    const base = shapeOf(item).base;
    if (tone === 'success' && card && !card[language] && base) {
        return (
            <div className="basis-full text-xs" role="note">
                {line(t('mirrorNameMissing', { name: card[language === 'de' ? 'en' : 'de'] }))}
                <div className="mt-1">
                    <button type="button" onClick={() => onGiveName(card.id, base)} className="min-h-9 rounded-full border border-control bg-page px-3 text-xs text-ink hover:border-ink">
                        {t('mirrorTakeName', { name: base })}
                    </button>
                </div>
            </div>
        );
    }
    // Green, but this row calls it something else: the card's name in this language is one tap away.
    if (tone === 'success' && card && card[language] && shoppingKey(base) !== shoppingKey(card[language])) {
        return (
            <div className="basis-full text-xs" role="note">
                {line(t('mirrorOtherName', { name: card[language], source }))}
                <div className="mt-1">
                    <button type="button" onClick={() => onItem(formatShape({ ...shapeOf(item), base: card[language] }))} className={chip}>
                        {t('mirrorUseName', { name: card[language] })}
                    </button>
                </div>
            </div>
        );
    }
    if (tone === 'warning') {
        // Decided once, in the original: said which row, and the way there.
        return (
            <div className="basis-full text-xs" role="note">
                {line(t('mirrorOpenAt', { source }))}
                <div className="mt-1">
                    <button type="button" onClick={onJump} className={chip}>
                        {t('mirrorJump')}
                    </button>
                </div>
            </div>
        );
    }
    return (
        <div className="basis-full text-xs" role="note">
            {line(tone === 'success' && card ? t('mirrorKnown', { name: card[language] }) : t('mirrorNewAt', { source }))}
        </div>
    );
}

/**
 * A card's explanation, under its green line: what the ingredient is
 * ("Koreanisches Chilipulver, grob gemahlen"), kept on the card and shown
 * beside it in every recipe. Read, or written in place.
 */
function InfoLine({ info, onSave }: { info: string; onSave: (info: string) => void }) {
    const t = useTranslations('RecipeForm');
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(info);
    const link = 'ml-1 underline underline-offset-2 hover:text-ink';
    if (!editing) {
        return (
            <p className="mt-0.5 text-muted">
                {info ? <span>{info}</span> : null}
                <button type="button" onClick={() => setEditing(true)} className={info ? link : 'underline underline-offset-2 hover:text-ink'}>
                    {info ? t('infoEdit') : t('infoAdd')}
                </button>
            </p>
        );
    }
    return (
        <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={300}
                // Enter saves the explanation — inside the recipe form it would otherwise save the recipe.
                onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    onSave(text.trim());
                    setEditing(false);
                }}
                placeholder={t('infoPlaceholder')}
                aria-label={t('infoLabel')}
                className="min-w-0 flex-1 rounded-lg border border-control bg-page px-2 py-1 text-base text-ink outline-none focus:border-ink sm:text-xs"
            />
            <button
                type="button"
                onClick={() => {
                    onSave(text.trim());
                    setEditing(false);
                }}
                className="min-h-9 rounded-full border border-control bg-page px-3 text-xs text-ink hover:border-ink"
            >
                {t('infoSave')}
            </button>
        </div>
    );
}

/**
 * An alternative's line ("oder Hüfte"): is it a card of the list — green —,
 * like one (a tap takes that one), or new — saving adds it. Its name only:
 * the row's unit and conversions are its ingredient's, never asked here.
 */
export function AltHint({ name, catalog, language, onTake }: { name: string; catalog: FormCatalogItem[]; language: 'de' | 'en'; onTake: (name: string) => void }) {
    const t = useTranslations('RecipeForm');
    const base = shapeOf(name).base.trim();
    if (catalog.length === 0 || base.length < 3) return null;
    const nameOf = (entry: MatchableItem) => (language === 'de' ? entry.de || entry.en : entry.en || entry.de);
    const line = (tone: 'success' | 'warning' | 'info', text: string) => (
        <span className={`inline-flex items-center gap-1.5 font-medium ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-info'}`}>
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-current" />
            {text}
        </span>
    );
    const known = matchIn(base, catalog);
    if (known) return <p className="text-xs">{line('success', t('hintKnown', { name: nameOf(known) }))}</p>;
    const alike = similarIn(base, catalog, 2);
    if (alike.length > 0) {
        return (
            <div className="text-xs">
                {line('warning', t('altAlike'))}
                <span className="mt-1 flex flex-wrap gap-2">
                    {alike.map((entry) => (
                        <button key={entry.id} type="button" onClick={() => onTake(nameOf(entry))} className="min-h-9 rounded-full border border-control bg-page px-3 text-xs text-ink hover:border-ink">
                            {t('altTake', { name: nameOf(entry) })}
                        </button>
                    ))}
                </span>
            </div>
        );
    }
    return <p className="text-xs">{line('info', t('altNew'))}</p>;
}
