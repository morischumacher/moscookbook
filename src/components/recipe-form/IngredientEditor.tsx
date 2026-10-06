'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Ingredient } from '@/lib/recipe';
import { parseIngredientLine } from '@/lib/recipeParser';
import { conventionalRows } from '@/lib/ingredientShape';
import { choiceFor, joinFromEditor, splitForEditor } from '@/lib/unitChoice';
import { itemKeys, matchIn } from '@/lib/ingredientMatch';
import { familyOf, measureOf, unitLabel } from '@/lib/ingredientUnits';
import IngredientHint, { type FormCatalogItem } from './IngredientHint';
import { sectionHeading } from '@/lib/ingredientParts';
import { fieldBase, fieldClass, labelClass } from './formStyles';
import AmountInput from './AmountInput';
import ItemInput from './ItemInput';
import { moved, useDragReorder } from '@/components/ui/useDragReorder';

export const EMPTY_ROW: Ingredient = { amount: '', item: '' };

/** A heading row, including one that has just been added and is still empty. */
function isHeadingRow(row: Ingredient): boolean {
    return row.amount.trim() === '' && (/^#/.test(row.item.trim()) || sectionHeading(row) !== null);
}

export default function IngredientEditor({
    ingredients,
    onChange,
    hints = true,
}: {
    ingredients: Ingredient[];
    onChange: (next: Ingredient[]) => void;
    /** The green / amber / blue line under each row (IngredientHint); off for the translation's rows. */
    hints?: boolean;
}) {
    const t = useTranslations('RecipeForm');
    const [bulk, setBulk] = useState('');
    const [showBulk, setShowBulk] = useState(false);
    const itemRefs = useRef<(HTMLInputElement | null)[]>([]);
    // Rows dragged by their handle, or moved with the arrow keys on it (work #48).
    const list = useRef<HTMLDivElement>(null);
    const { handle, rowStyle } = useDragReorder(list, (from, to) => onChange(moved(ingredients, from, to)));
    const grip = (index: number) => (
        <button
            type="button"
            {...handle(index)}
            aria-label={t('rowDrag', { number: index + 1 })}
            title={t('rowDragHint')}
            className="flex h-10 w-8 shrink-0 select-none items-center justify-center text-lg text-faint hover:text-ink"
        >
            ⠿
        </button>
    );
    // The names already in the cookbook, for the suggestions (ItemInput).
    const locale = useLocale();
    const [names, setNames] = useState<string[]>([]);
    // The catalogue: each ingredient's names, standard unit and conversions (IngredientHint).
    const [catalog, setCatalog] = useState<FormCatalogItem[]>([]);
    // Names the admin chose to keep as new ingredients, not to be asked about again here.
    const [keptNew, setKeptNew] = useState<Set<string>>(new Set());
    const lang = locale === 'en' ? 'en' : 'de';
    useEffect(() => {
        let gone = false;
        fetch(`/api/ingredients/names?locale=${locale}`)
            .then((res) => (res.ok ? res.json() : { names: [] }))
            .then((data: { names: string[]; items?: FormCatalogItem[] }) => {
                if (gone) return;
                setNames(data.names);
                setCatalog(data.items ?? []);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [locale]);

    const update = (index: number, field: keyof Ingredient, value: string) => {
        const next = ingredients.map((row, position) => {
            if (position !== index) return row;
            const changed = { ...row, [field]: value };
            return field === 'item' ? withUsualUnit(changed) : changed;
        });
        onChange(next);
    };

    /*
     * A row with no unit yet takes the ingredient's standard unit ("Minze" →
     * "Bund", lib/ingredientUnits); one chosen by hand is never replaced —
     * when it is of another kind, the hint below the row asks about it.
     */
    const withUsualUnit = (row: Ingredient): Ingredient => {
        const fields = splitForEditor(row.amount);
        if (fields.choice !== '') return row;
        const known = matchIn(row.item, catalog);
        if (!known || !known.unit) return row;
        const choice = choiceFor(known.unit);
        return { ...row, amount: joinFromEditor({ quantity: fields.quantity, choice, custom: choice === 'custom' ? unitLabel(known.unit, lang) : '' }, lang) };
    };

    const send = (body: object) =>
        fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);

    /** The ingredient we have renamed to a row's name, in every recipe (admin → Zutaten does the same). */
    const overwriteName = (id: number, name: string) => {
        setCatalog((current) =>
            current.map((entry) => {
                if (entry.id !== id) return entry;
                const old = entry[lang];
                const next = { ...entry, [lang]: name, aliases: old && old !== name ? [...entry.aliases, old] : entry.aliases };
                return { ...next, keys: itemKeys(next) };
            })
        );
        void send({ action: 'renameItem', id, name, locale: lang });
    };

    /** A row's unit made the ingredient's standard one; the recipes follow where that is sure. */
    const overwriteUnit = (id: number, unit: string) => {
        const kind = familyOf(measureOf(unit));
        setCatalog((current) => current.map((entry) => (entry.id === id ? { ...entry, unit, moreUnits: entry.moreUnits.filter((other) => other !== kind) } : entry)));
        void send({ action: 'setUnit', id, unit });
    };

    /** "Allow this unit too", saved on the ingredient at once (admin → Zutaten shows the same). */
    const allowUnit = (id: number, measure: string) => {
        setCatalog((current) => current.map((entry) => (entry.id === id ? { ...entry, moreUnits: [...entry.moreUnits, measure] } : entry)));
        void fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'allowUnit', id, measure }) }).catch(() => undefined);
    };

    const addRow = (afterIndex?: number) => {
        const next = [...ingredients];
        const position = afterIndex === undefined ? next.length : afterIndex + 1;
        next.splice(position, 0, { ...EMPTY_ROW });
        onChange(next);
        // Focus the new row so a whole list can be typed without the mouse.
        requestAnimationFrame(() => itemRefs.current[position]?.focus());
    };

    const removeRow = (index: number) => {
        const next = ingredients.filter((_, position) => position !== index);
        onChange(next.length > 0 ? next : [{ ...EMPTY_ROW }]);
    };

    const applyBulk = () => {
        const parsed = bulk
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map(parseIngredientLine)
            .filter((row) => row.item !== '');

        if (parsed.length === 0) return;

        const existing = ingredients.filter((row) => row.item.trim() !== '');
        // Written the cookbook's way, as a row typed in is on leaving it (lib/ingredientShape).
        onChange([...existing, ...conventionalRows(parsed)]);
        setBulk('');
        setShowBulk(false);
    };

    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
                <label className={labelClass + ' mb-0'}>{t('ingredients')}</label>
                <button type="button" onClick={() => setShowBulk((open) => !open)} className="text-sm text-muted underline underline-offset-4">
                    {showBulk ? t('closeList') : t('pasteList')}
                </button>
            </div>

            {showBulk && (
                <div className="mb-4 flex flex-col gap-2">
                    <textarea value={bulk} onChange={(event) => setBulk(event.target.value)} rows={6} placeholder={t('bulkPlaceholder')} className={fieldClass + ' font-mono text-sm'} />
                    <button type="button" onClick={applyBulk} className="self-start rounded-full border border-line px-4 py-1.5 text-sm hover:border-ink">
                        {t('appendIngredients')}
                    </button>
                </div>
            )}

            <div ref={list} className="flex flex-col gap-2">
                {ingredients.map((row, index) =>
                    isHeadingRow(row) ? (
                        // A heading: one wide field, drawn as a heading, with
                        // the "## " that marks it kept out of sight.
                        <div key={index} data-drag-row style={rowStyle(index)} className={`mt-3 flex items-center gap-2 bg-page`}>
                            {grip(index)}
                            <input
                                ref={(element) => {
                                    itemRefs.current[index] = element;
                                }}
                                type="text"
                                value={row.item.replace(/^#{1,3}\s?/, '').replace(/:$/, '')}
                                onChange={(event) => update(index, 'item', `## ${event.target.value}`)}
                                placeholder={t('sectionPlaceholder')}
                                aria-label={t('sectionLabel')}
                                className={fieldBase + ' w-0 flex-1 font-bold'}
                            />
                            <button
                                type="button"
                                onClick={() => removeRow(index)}
                                aria-label={t('removeSection')}
                                className="flex h-10 w-8 shrink-0 items-center justify-center text-faint hover:text-danger"
                            >
                                ×
                            </button>
                        </div>
                    ) : (
                        // On a phone two lines: the ingredient across the width,
                        // then its amount, unit and the row's buttons.
                        <div key={index} data-drag-row style={rowStyle(index)} className={`flex flex-wrap items-center gap-2 border-b border-line bg-page pb-2 sm:border-0 sm:pb-0`}>
                            <AmountInput amount={row.amount} number={index + 1} onChange={(next) => update(index, 'amount', next)} />
                            <ItemInput
                                inputRef={(element) => {
                                    itemRefs.current[index] = element;
                                }}
                                value={row.item}
                                names={names}
                                onChange={(next) => update(index, 'item', next)}
                                onEnter={() => addRow(index)}
                                placeholder={t('itemPlaceholder')}
                                label={t('itemLabel', { number: index + 1 })}
                                className={fieldBase}
                            />
                            <div className="ml-auto flex shrink-0 items-center gap-0.5">
                                {grip(index)}
                                <button
                                    type="button"
                                    onClick={() => removeRow(index)}
                                    aria-label={t('rowRemove', { number: index + 1 })}
                                    className="flex h-10 w-7 items-center justify-center text-faint hover:text-danger sm:w-8"
                                >
                                    ×
                                </button>
                            </div>
                            {hints && (
                                <IngredientHint
                                    item={row.item}
                                    amount={row.amount}
                                    catalog={catalog}
                                    locale={lang}
                                    keptNew={keptNew.has(row.item.trim().toLowerCase())}
                                    onItem={(next) => update(index, 'item', next)}
                                    onAmount={(next) => update(index, 'amount', next)}
                                    onKeepNew={() => setKeptNew((current) => new Set(current).add(row.item.trim().toLowerCase()))}
                                    onAllow={allowUnit}
                                    onOverwriteName={overwriteName}
                                    onOverwriteUnit={overwriteUnit}
                                    onRename={() => {
                                        const input = itemRefs.current[index];
                                        input?.focus();
                                        input?.select();
                                    }}
                                />
                            )}
                        </div>
                    ),
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => addRow()} className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-ink">
                    {t('addIngredient')}
                </button>
                {/* "For the dough", "For the sauce": everything below a
                    heading belongs to it, until the next one. */}
                <button
                    type="button"
                    onClick={() => {
                        // An empty last row is replaced rather than left
                        // stranded above the new heading.
                        const last = ingredients[ingredients.length - 1];
                        const kept = last && !last.item.trim() && !last.amount.trim() ? ingredients.slice(0, -1) : ingredients;
                        onChange([...kept, { amount: '', item: '## ' }, { ...EMPTY_ROW }]);
                        requestAnimationFrame(() => itemRefs.current[kept.length]?.focus());
                    }}
                    className="rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:border-ink hover:text-ink"
                >
                    {t('addSection')}
                </button>
            </div>
            <p className="mt-2 text-xs text-muted">{t('enterHint')}</p>
        </div>
    );
}
