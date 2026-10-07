'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Ingredient } from '@/lib/recipe';
import { parseIngredientLine } from '@/lib/recipeParser';
import { conventionalRows, joinParts, partsOf, withBase, type IngredientShape } from '@/lib/ingredientShape';
import { itemKeys, matchIn } from '@/lib/ingredientMatch';
import { familyOf, measureOf, rebased, storedFactor } from '@/lib/ingredientUnits';
import IngredientHint, { MirrorHint, rowStatus, type FormCatalogItem, type RowAnswer } from './IngredientHint';
import { fieldBase, fieldClass, labelClass } from './formStyles';
import AmountInput from './AmountInput';
import ItemInput, { type Described, type LinkableRecipe } from './ItemInput';
import { moved, useDragReorder } from '@/components/ui/useDragReorder';
import { formatAmount, sectionHeading, splitAmount } from '@/lib/ingredientParts';
import { toUS } from '@/lib/units';

export const EMPTY_ROW: Ingredient = { amount: '', item: '' };

/** A heading row, including one that has just been added and is still empty. */
function isHeadingRow(row: Ingredient): boolean {
    return row.amount.trim() === '' && (/^#/.test(row.item.trim()) || sectionHeading(row) !== null);
}

export default function IngredientEditor({
    ingredients,
    onChange,
    hints = true,
    language,
    onKnown,
    mirrorOf,
    recipeId,
}: {
    ingredients: Ingredient[];
    /** The recipe being edited: not offered as an ingredient of itself. */
    recipeId?: number;
    onChange: (next: Ingredient[]) => void;
    /** The recipe's language: names and units are written and shown in it. Default: the page's. */
    language?: 'de' | 'en';
    /** A row became an ingredient of the list: its names, for the row beside it in the other language. */
    onKnown?: (index: number, names: { de: string; en: string }) => void;
    /** The original's rows, for a translation: each row then shows the colour of the original's row beside it (MirrorHint). */
    mirrorOf?: Ingredient[];
    /** The green / amber / blue line under each row (IngredientHint); off for the translation's rows. */
    hints?: boolean;
}) {
    const t = useTranslations('RecipeForm');
    const [bulk, setBulk] = useState('');
    const [showBulk, setShowBulk] = useState(false);
    const itemRefs = useRef<(HTMLInputElement | null)[]>([]);
    // The preparation and notes fields: a comma or a bracket typed into the ingredient moves on to them.
    const formRefs = useRef<(HTMLInputElement | null)[]>([]);
    const noteRefs = useRef<(HTMLInputElement | null)[]>([]);
    // Rows dragged by their handle, or moved with the arrow keys on it (work #48).
    const list = useRef<HTMLDivElement>(null);
    const { drag, handle, rowStyle } = useDragReorder(list, (from, to) => onChange(moved(ingredients, from, to)));
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
    const lang: 'de' | 'en' = language ?? (locale === 'en' ? 'en' : 'de');
    const [aiAvailable, setAiAvailable] = useState(false);
    // The cookbook's recipes, each in this language: a row can be one of them ("Kimchi").
    const [recipes, setRecipes] = useState<LinkableRecipe[]>([]);
    // The names with their few words, found by those too ("Gesalzene Garnelen" → Saeujeot).
    const [described, setDescribed] = useState<Described[]>([]);
    useEffect(() => {
        let gone = false;
        fetch(`/api/ingredients/names?locale=${lang}`)
            .then((res) => (res.ok ? res.json() : { names: [] }))
            .then((data: { names: string[]; items?: FormCatalogItem[]; aiAvailable?: boolean; recipes?: LinkableRecipe[]; described?: Described[] }) => {
                if (gone) return;
                setNames(data.names);
                setCatalog(data.items ?? []);
                setAiAvailable(Boolean(data.aiAvailable));
                setRecipes(data.recipes ?? []);
                setDescribed(data.described ?? []);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [lang]);

    /** A row's ingredient, preparation, notes or "optional" changed: written back as one name, the one way (lib/ingredientShape). */
    const setParts = (index: number, parts: IngredientShape) => update(index, 'item', joinParts(parts));

    /** A row made one of the cookbook's recipes, or no longer one. */
    const setLink = (index: number, recipe: LinkableRecipe | null) => {
        onChange(
            ingredients.map((row, position) =>
                position !== index
                    ? row
                    : recipe
                      ? // The title up to a bracket or comma: "Kimchi-Pfannkuchen (Kimchijeon)" is "Kimchi-Pfannkuchen" here.
                        { ...row, item: joinParts({ ...partsOf(row.item), base: recipe.title.split(/[(,]/)[0].trim() || recipe.title }), linkedRecipeId: recipe.id }
                      : { ...row, linkedRecipeId: null }
            )
        );
    };

    const update = (index: number, field: 'amount' | 'item', value: string) => {
        const next = ingredients.map((row, position) => {
            if (position !== index) return row;
            return { ...row, [field]: value };
        });
        onChange(next);
        // The other language follows at once: the list's name there (lib/ingredientMatch syncedRows).
        if (field === 'item') {
            const known = matchIn(value, catalog);
            if (known) onKnown?.(index, { de: known.de, en: known.en });
        }
    };

    const send = (body: object) =>
        fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);

    /** The ingredient we have renamed to a row's name, in every recipe (admin → Zutaten does the same). */
    const overwriteName = (id: number, name: string) => {
        setCatalog((current) =>
            current.map((entry) => {
                if (entry.id !== id) return entry;
                const old = entry[lang];
                const field = lang === 'de' ? 'aliases' : 'enAliases';
                const next = { ...entry, [lang]: name, [field]: old && old !== name ? [...entry[field], old] : entry[field] };
                return { ...next, keys: itemKeys(next) };
            })
        );
        void send({ action: 'renameItem', id, name, locale: lang });
    };

    /** A row's unit made the card's main unit; the old one stays as a further unit (admin → Zutaten does the same). */
    const overwriteUnit = (id: number, unit: string) => {
        setCatalog((current) =>
            current.map((entry) => {
                if (entry.id !== id) return entry;
                const old = entry.unit === null ? null : familyOf(measureOf(entry.unit));
                const mainMeasure = measureOf(unit);
                return {
                    ...entry,
                    unit,
                    moreUnits: [...entry.moreUnits, ...(old ? [old] : [])].filter((other) => other !== familyOf(mainMeasure)),
                    units: entry.units && mainMeasure ? rebased(entry.units, mainMeasure) : entry.units,
                };
            })
        );
        void send({ action: 'setMain', id, unit });
    };

    /** A row's unit added to the card, with its conversion: "1 EL = 14 g". */
    const keepUnit = (id: number, unit: string, a: number, b: number) => {
        setCatalog((current) =>
            current.map((entry) => {
                if (entry.id !== id || entry.unit === null) return entry;
                const mainMeasure = measureOf(entry.unit);
                const stored = storedFactor(unit, a, entry.unit, b);
                const family = familyOf(measureOf(unit));
                if (!mainMeasure || !stored || !family) return entry;
                const base = entry.units ? rebased(entry.units, mainMeasure) : { buy: mainMeasure, factors: {} };
                return { ...entry, moreUnits: [...entry.moreUnits, family], units: { buy: mainMeasure, factors: { ...base.factors, [stored.measure]: stored.factor } } };
            })
        );
        void send({ action: 'resolveUnit', id, unit, a, b, choice: 'keep' });
    };

    /** A row's name given to a card that had none in this language: the row is that card from now on. */
    const giveName = (id: number, name: string) => {
        setCatalog((current) =>
            current.map((entry) => {
                if (entry.id !== id) return entry;
                const next = { ...entry, [lang]: name };
                return { ...next, keys: itemKeys(next) };
            })
        );
        void send({ action: 'giveName', id, language: lang, name });
    };

    /** A card's explanation in this language, kept on the card for every recipe. */
    const setInfo = (id: number, info: string) => {
        const field = lang === 'de' ? 'infoDe' : 'infoEn';
        setCatalog((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: info } : entry)));
        void send({ action: 'setInfo', id, language: lang, info });
    };

    /** One amber row left to the AI (applied by the hint, as a tap would). */
    const askAi = async (question: object): Promise<RowAnswer | null> => {
        const res = await fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'aiRow', question }) }).catch(() => null);
        return res?.ok ? ((await res.json()) as RowAnswer) : null;
    };

    /** The row in cups and ounces, when it is in grams or millilitres; null otherwise. */
    const usAmount = (row: Ingredient): string | null => {
        const parts = splitAmount(row.amount);
        if (parts.quantity === null || !parts.unit) return null;
        const kind = measureOf(parts.unit);
        if (kind !== 'mass' && kind !== 'volume') return null;
        const us = toUS(parts, row.item, lang);
        return us.unit && us.unit !== parts.unit ? formatAmount(us, 1, lang) : null;
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
                            {/* With the ingredient's usual unit chosen while the amount is empty ("Minze" → Bund); one chosen by hand is never replaced. */}
                            <AmountInput amount={row.amount} number={index + 1} language={lang} usual={matchIn(row.item, catalog)?.unit} onChange={(next) => update(index, 'amount', next)} />
                            <ItemInput
                                inputRef={(element) => {
                                    itemRefs.current[index] = element;
                                }}
                                value={partsOf(row.item).base}
                                names={names}
                                described={described}
                                recipes={mirrorOf ? [] : recipes.filter((recipe) => recipe.id !== recipeId)}
                                onChange={(next) => {
                                    setParts(index, withBase(partsOf(row.item), next));
                                    // "Knoblauch," goes on in the preparation, "Knoblauch (" in the notes.
                                    const field = next.includes('(') ? noteRefs : next.includes(',') ? formRefs : null;
                                    if (field) requestAnimationFrame(() => field.current[index]?.focus());
                                }}
                                onRecipe={(recipe) => setLink(index, recipe)}
                                // Tidied on leaving: no jump back into the row — and a recipe's title is its title.
                                onTidy={(next) => !row.linkedRecipeId && setParts(index, withBase(partsOf(row.item), next))}
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
                            {/* The rest of the one way of writing it, each in its own field: "Knoblauch" · "gehackt" · "große Zehen" · optional. */}
                            {(() => {
                                const parts = partsOf(row.item);
                                return (
                                    <div className="flex basis-full items-center gap-2">
                                        <input
                                            ref={(element) => {
                                                formRefs.current[index] = element;
                                            }}
                                            type="text"
                                            value={parts.form}
                                            onChange={(event) => setParts(index, { ...parts, form: event.target.value.replace(/^\s+/, '') })}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    addRow(index);
                                                }
                                            }}
                                            placeholder={t('formPlaceholder')}
                                            aria-label={t('formLabel', { number: index + 1 })}
                                            className={fieldBase + ' w-0 flex-1 py-1.5 text-sm'}
                                        />
                                        <input
                                            ref={(element) => {
                                                noteRefs.current[index] = element;
                                            }}
                                            type="text"
                                            value={parts.note}
                                            onChange={(event) => setParts(index, { ...parts, note: event.target.value.replace(/^\s+/, '') })}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    addRow(index);
                                                }
                                            }}
                                            placeholder={t('notePlaceholder')}
                                            aria-label={t('noteLabel', { number: index + 1 })}
                                            className={fieldBase + ' w-0 flex-1 py-1.5 text-sm'}
                                        />
                                        <label className="flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 text-sm text-muted">
                                            <input
                                                type="checkbox"
                                                checked={parts.optional}
                                                onChange={(event) => setParts(index, { ...parts, optional: event.target.checked })}
                                                className="h-5 w-5 accent-current"
                                            />
                                            {t('optionalRow')}
                                        </label>
                                    </div>
                                );
                            })()}
                            {/* One of the cookbook's own recipes: it links there on the recipe page. */}
                            {!mirrorOf && row.linkedRecipeId && (
                                <p className="basis-full text-xs text-info">
                                    {t('linkedRecipe', { title: recipes.find((recipe) => recipe.id === row.linkedRecipeId)?.title ?? partsOf(row.item).base })}{' '}
                                    <button type="button" onClick={() => setLink(index, null)} className="ml-1 underline underline-offset-2">
                                        {t('unlinkRecipe')}
                                    </button>
                                </p>
                            )}
                            {/* The amount as an American reader sees it ("480 ml" → "2 cups"): to round a number that came out crooked. */}
                            {!drag && usAmount(row) && <p className="basis-full text-xs text-faint">{t('usAmount', { amount: usAmount(row)! })}</p>}
                            {/* Folded away while a row is dragged: every row its compact self, so the places add up. */}
                            {hints && !drag && mirrorOf && (() => {
                                // The original's row beside this one: the same place when the lists line up (lib/ingredientMatch
                                // followedRows keeps them so), else by place among the filled rows.
                                const place = ingredients.slice(0, index).filter((other) => other.item.trim()).length;
                                const source = mirrorOf.length === ingredients.length ? mirrorOf[index] : mirrorOf.filter((other) => other.item.trim())[place];
                                const status = source ? rowStatus(source.item, source.amount, catalog) : { tone: null, card: null };
                                return <MirrorHint tone={status.tone} card={status.card} item={row.item} language={lang} onGiveName={giveName} />;
                            })()}
                            {hints && !drag && !mirrorOf && !row.linkedRecipeId && (
                                <IngredientHint
                                    // A fresh hint for each name and amount: its conversion fields start from them.
                                    key={`${row.item}|${row.amount}`}
                                    item={row.item}
                                    amount={row.amount}
                                    catalog={catalog}
                                    language={lang}
                                    aiAvailable={aiAvailable}
                                    onAi={askAi}
                                    onKeepUnit={keepUnit}
                                    onGiveName={giveName}
                                    onInfo={setInfo}
                                    keptNew={keptNew.has(row.item.trim().toLowerCase())}
                                    onItem={(next) => update(index, 'item', next)}
                                    onAmount={(next) => update(index, 'amount', next)}
                                    onKeepNew={() => setKeptNew((current) => new Set(current).add(row.item.trim().toLowerCase()))}
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
