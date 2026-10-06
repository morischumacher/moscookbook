'use client';

import { useTranslations } from 'next-intl';
import { splitAmount, formatAmount } from '@/lib/ingredientParts';
import { formatShape, shapeOf } from '@/lib/ingredientShape';
import { matchIn, similarIn, type MatchableItem } from '@/lib/ingredientMatch';
import { convertQuantity, familyOf, measureOf, unitKey, unitLabel } from '@/lib/ingredientUnits';
import type { Units } from '@/lib/shoppingParts';

export interface FormCatalogItem extends MatchableItem {
    /** Its standard unit ('g', 'bunch', '' for pieces), or null when undecided. */
    unit: string | null;
    moreUnits: string[];
    units: Units | null;
}

/**
 * Where an ingredient row of the recipe form stands with the cookbook's list
 * (lib/ingredientMatch, lib/ingredientUnits), in one of three colours — the
 * same for a recipe typed in and one imported and checked as a draft:
 *
 * - green: an ingredient we have, in a unit it is written in;
 * - amber: something to decide — a similar ingredient (take it, overwrite
 *   it with this name, or make this one new), or a known one in another unit
 *   (convert to its unit, allow this unit too, make this unit its standard,
 *   or call it something else: another ingredient);
 * - blue: nothing like it yet — saving adds it to the list.
 */
export default function IngredientHint({
    item,
    amount,
    catalog,
    locale,
    keptNew,
    onItem,
    onAmount,
    onKeepNew,
    onAllow,
    onRename,
    onOverwriteName,
    onOverwriteUnit,
}: {
    item: string;
    amount: string;
    catalog: FormCatalogItem[];
    locale: 'de' | 'en';
    /** "Add as new ingredient" was tapped for this name. */
    keptNew: boolean;
    onItem: (next: string) => void;
    onAmount: (next: string) => void;
    onKeepNew: () => void;
    onAllow: (id: number, measure: string) => void;
    /** "Another ingredient": back into the name field, to call it something else. */
    onRename: () => void;
    /** The ingredient we have renamed to this row's name — in every recipe. */
    onOverwriteName: (id: number, name: string) => void;
    /** This row's unit made the ingredient's standard one. */
    onOverwriteUnit: (id: number, unit: string) => void;
}) {
    const t = useTranslations('RecipeForm');
    const name = item.trim();
    if (catalog.length === 0 || name.length < 3 || name.startsWith('#')) return null;
    const nameOf = (entry: MatchableItem) => (locale === 'de' ? entry.de || entry.en : entry.en || entry.de);
    const chip = 'min-h-9 rounded-full border border-control px-3 text-xs text-ink hover:border-ink';
    const status = (tone: 'success' | 'warning' | 'info', text: string) => (
        <span className={`inline-flex items-center gap-1.5 font-medium ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-info'}`}>
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-current" />
            {text}
        </span>
    );

    const known = matchIn(name, catalog);
    if (!known) {
        const alike = keptNew ? [] : similarIn(name, catalog);
        if (alike.length === 0) {
            return (
                <div className="basis-full text-xs" role="note">
                    {status('info', t('hintNew'))} <span className="text-muted">{t('hintNewExplain')}</span>
                </div>
            );
        }
        return (
            <div className="basis-full text-xs text-muted" role="note">
                {status('warning', t('hintAlike'))}
                <span className="mt-1 flex flex-wrap items-center gap-2">
                    {alike.map((entry) => (
                        <button key={entry.id} type="button" onClick={() => onItem(formatShape({ ...shapeOf(name), base: nameOf(entry) }))} className={chip}>
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
                </span>
            </div>
        );
    }

    // Known: is its unit one this ingredient is written in?
    const parts = splitAmount(amount);
    const written = parts.unit ?? '';
    const kind = familyOf(measureOf(written));
    const standardKind = known.unit === null ? null : familyOf(measureOf(known.unit));
    const fits = known.unit === null || (parts.quantity === null && !parts.unit) || !kind || kind === standardKind || known.moreUnits.includes(kind);
    if (fits) {
        return (
            <div className="basis-full text-xs" role="note">
                {status('success', known.unit !== null ? t('hintKnownUnit', { name: nameOf(known), unit: unitLabel(known.unit, locale) }) : t('hintKnown', { name: nameOf(known) }))}
            </div>
        );
    }

    const standard = unitLabel(known.unit!, locale);
    const quantity = parts.quantity === null ? null : convertQuantity(parts.quantity, written, known.unit!, known.units);
    const quantityMax = parts.quantityMax === null ? null : convertQuantity(parts.quantityMax, written, known.unit!, known.units);
    const converted =
        quantity === null ? null : formatAmount({ quantity, quantityMax, unit: known.unit === '' ? null : unitLabel(known.unit!, locale, (quantityMax ?? quantity) > 1) }, 1, locale);
    return (
        <div className="basis-full text-xs text-muted" role="note">
            {status('warning', t('hintUnit', { name: nameOf(known), unit: standard }))}
            <span className="mt-1 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    // With no known way from one to the other, the unit changes and the number is left to check.
                    onClick={() => onAmount(converted ?? formatAmount({ quantity: parts.quantity, quantityMax: parts.quantityMax, unit: known.unit === '' ? null : standard }, 1, locale))}
                    className={chip}
                >
                    {converted ? t('hintConvert', { amount: converted }) : t('hintSwitch', { unit: standard })}
                </button>
                <button type="button" onClick={() => onAllow(known.id, kind!)} className={chip}>
                    {t('hintAllow', { unit: written || unitLabel('', locale) })}
                </button>
                <button type="button" onClick={() => onOverwriteUnit(known.id, unitKey(written))} className={chip}>
                    {t('hintOverwriteUnit', { unit: written || unitLabel('', locale) })}
                </button>
                <button type="button" onClick={onRename} className={chip}>
                    {t('hintOther')}
                </button>
            </span>
        </div>
    );
}
