'use client';

import { useTranslations } from 'next-intl';
import { splitAmount, formatAmount } from '@/lib/ingredientParts';
import { formatShape, shapeOf } from '@/lib/ingredientShape';
import { matchIn, similarIn, type MatchableItem } from '@/lib/ingredientMatch';
import { convertQuantity, familyOf, measureOf, unitLabel } from '@/lib/ingredientUnits';
import type { Units } from '@/lib/shoppingParts';

export interface FormCatalogItem extends MatchableItem {
    /** Its standard unit ('g', 'bunch', '' for pieces), or null when undecided. */
    unit: string | null;
    moreUnits: string[];
    units: Units | null;
}

/**
 * What the form says under an ingredient row, from the catalogue
 * (lib/ingredientMatch, lib/ingredientUnits):
 *
 * - a name the cookbook does not know yet: "new", and the ones that look
 *   alike, each a tap to take instead — or keep it new;
 * - a known one in a unit of another kind than its standard one ("Pasta is
 *   usually in g"): convert the row to it, or allow this unit for it too.
 *
 * Nothing for a known name in its own unit: the quiet case is the common one.
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
}: {
    item: string;
    amount: string;
    catalog: FormCatalogItem[];
    locale: 'de' | 'en';
    /** "Keep it new" was tapped for this name. */
    keptNew: boolean;
    onItem: (next: string) => void;
    onAmount: (next: string) => void;
    onKeepNew: () => void;
    onAllow: (id: number, measure: string) => void;
}) {
    const t = useTranslations('RecipeForm');
    const name = item.trim();
    if (catalog.length === 0 || name.length < 3 || name.startsWith('#')) return null;
    const nameOf = (entry: MatchableItem) => (locale === 'de' ? entry.de || entry.en : entry.en || entry.de);
    const chip = 'min-h-9 rounded-full border border-control px-3 text-xs text-ink hover:border-ink';

    const known = matchIn(name, catalog);
    if (!known) {
        if (keptNew) return null;
        const alike = similarIn(name, catalog);
        return (
            <div className="basis-full text-xs text-muted" role="note">
                <span className="mr-2 inline-block rounded-full bg-surface px-2 py-0.5 font-semibold text-ink">{t('hintNew')}</span>
                {alike.length > 0 ? (
                    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
                        {t('hintAlike')}
                        {alike.map((entry) => (
                            <button key={entry.id} type="button" onClick={() => onItem(formatShape({ ...shapeOf(name), base: nameOf(entry) }))} className={chip}>
                                {nameOf(entry)}
                            </button>
                        ))}
                        <button type="button" onClick={onKeepNew} className="min-h-9 px-1 underline underline-offset-4 hover:text-ink">
                            {t('hintKeepNew')}
                        </button>
                    </span>
                ) : (
                    t('hintNewExplain')
                )}
            </div>
        );
    }

    // Known: is its unit one this ingredient is written in?
    const parts = splitAmount(amount);
    if (known.unit === null || (parts.quantity === null && !parts.unit)) return null;
    const written = parts.unit ?? '';
    const kind = familyOf(measureOf(written));
    const standardKind = familyOf(measureOf(known.unit));
    if (!kind || kind === standardKind || known.moreUnits.includes(kind)) return null;

    const standard = unitLabel(known.unit, locale);
    const quantity = parts.quantity === null ? null : convertQuantity(parts.quantity, written, known.unit, known.units);
    const quantityMax = parts.quantityMax === null ? null : convertQuantity(parts.quantityMax, written, known.unit, known.units);
    const converted =
        quantity === null
            ? null
            : formatAmount({ quantity, quantityMax, unit: known.unit === '' ? null : unitLabel(known.unit, locale, (quantityMax ?? quantity) > 1) }, 1, locale);
    return (
        <div className="basis-full text-xs text-muted" role="note">
            <span>{t('hintUnit', { name: nameOf(known), unit: standard })}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    // With no known way from one to the other, the unit changes and the number is left to check.
                    onClick={() => onAmount(converted ?? formatAmount({ quantity: parts.quantity, quantityMax: parts.quantityMax, unit: known.unit === '' ? null : standard }, 1, locale))}
                    className={chip}
                >
                    {converted ? t('hintConvert', { amount: converted }) : t('hintSwitch', { unit: standard })}
                </button>
                <button type="button" onClick={() => onAllow(known.id, kind)} className={chip}>
                    {t('hintAllow', { unit: written || unitLabel('', locale) })}
                </button>
            </span>
        </div>
    );
}
