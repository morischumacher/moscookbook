'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Ingredient } from '@/lib/recipe';
import { parseIngredientLine } from '@/lib/recipeParser';
import { sectionHeading } from '@/lib/ingredientParts';
import { fieldBase, fieldClass, labelClass } from './formStyles';

export const EMPTY_ROW: Ingredient = { amount: '', item: '' };

/** A heading row, including one that has just been added and is still empty. */
function isHeadingRow(row: Ingredient): boolean {
    return row.amount.trim() === '' && (/^#/.test(row.item.trim()) || sectionHeading(row) !== null);
}

export default function IngredientEditor({
    ingredients,
    onChange,
}: {
    ingredients: Ingredient[];
    onChange: (next: Ingredient[]) => void;
}) {
    const t = useTranslations('RecipeForm');
    const [bulk, setBulk] = useState('');
    const [showBulk, setShowBulk] = useState(false);
    const itemRefs = useRef<(HTMLInputElement | null)[]>([]);

    const update = (index: number, field: keyof Ingredient, value: string) => {
        const next = ingredients.map((row, position) =>
            position === index ? { ...row, [field]: value } : row
        );
        onChange(next);
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

    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= ingredients.length) return;
        const next = [...ingredients];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
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
        onChange([...existing, ...parsed]);
        setBulk('');
        setShowBulk(false);
    };

    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
                <label className={labelClass + ' mb-0'}>{t('ingredients')}</label>
                <button
                    type="button"
                    onClick={() => setShowBulk((open) => !open)}
                    className="text-sm text-muted underline underline-offset-4"
                >
                    {showBulk ? t('closeList') : t('pasteList')}
                </button>
            </div>

            {showBulk && (
                <div className="mb-4 flex flex-col gap-2">
                    <textarea
                        value={bulk}
                        onChange={(event) => setBulk(event.target.value)}
                        rows={6}
                        placeholder={t('bulkPlaceholder')}
                        className={fieldClass + ' font-mono text-sm'}
                    />
                    <button
                        type="button"
                        onClick={applyBulk}
                        className="self-start rounded-full border border-line px-4 py-1.5 text-sm hover:border-ink"
                    >
                        {t('appendIngredients')}
                    </button>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {ingredients.map((row, index) =>
                    isHeadingRow(row) ? (
                        // A heading: one wide field, drawn as a heading, with
                        // the "## " that marks it kept out of sight.
                        <div key={index} className="mt-3 flex items-center gap-2">
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
                    <div key={index} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={row.amount}
                            onChange={(event) => update(index, 'amount', event.target.value)}
                            placeholder={t('amountPlaceholder')}
                            aria-label={t('amountLabel', { number: index + 1 })}
                            className={fieldBase + ' w-[5.5rem] shrink-0 sm:w-32'}
                        />
                        <input
                            ref={(element) => {
                                itemRefs.current[index] = element;
                            }}
                            type="text"
                            value={row.item}
                            onChange={(event) => update(index, 'item', event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addRow(index);
                                }
                            }}
                            placeholder={t('itemPlaceholder')}
                            aria-label={t('itemLabel', { number: index + 1 })}
                            className={fieldBase + ' w-0 flex-1'}
                        />
                        <div className="flex shrink-0 items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => move(index, -1)}
                                aria-label={t('rowUp', { number: index + 1 })}
                                className="flex h-10 w-7 items-center justify-center text-faint hover:text-ink sm:w-8"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                onClick={() => move(index, 1)}
                                aria-label={t('rowDown', { number: index + 1 })}
                                className="flex h-10 w-7 items-center justify-center text-faint hover:text-ink sm:w-8"
                            >
                                ↓
                            </button>
                            <button
                                type="button"
                                onClick={() => removeRow(index)}
                                aria-label={t('rowRemove', { number: index + 1 })}
                                className="flex h-10 w-7 items-center justify-center text-faint hover:text-danger sm:w-8"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                    )
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => addRow()}
                    className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-ink"
                >
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
            <p className="mt-2 text-xs text-muted">
                {t('enterHint')}
            </p>
        </div>
    );
}
