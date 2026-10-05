'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { sayable } from '@/lib/apiMessage';
import { useConfirm } from '@/components/ui/useConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import Sheet from '@/components/ui/Sheet';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';
import type { Units } from '@/lib/shoppingParts';
import { buyLabel, conversionLines, readConversion } from '@/lib/unitConversion';

interface Item {
    id: number;
    de: string;
    en: string;
    aliases: string[];
    uses: number;
    /** What the shopping list converts with; null when nothing is known. */
    units: Units | null;
    /** Set here (or learned from the AI), rather than the defaults. */
    ownUnits: boolean;
    createdAt: string;
}

/** The ways into the list: what needs looking at first, then by age and use. */
type View = 'doubles' | 'missing' | 'newest' | 'used' | 'unused' | 'all';

interface Double {
    a: number;
    b: number;
    reason: 'sameName' | 'contained' | 'typo';
}

/**
 * The cookbook's ingredients (lib/ingredientCatalog): every one, in German
 * and English, with the further names it goes by — to correct, to merge when
 * two are one, and to complete the other language.
 *
 * Doubles are proposed in two ways. By rules, always and free (lib/
 * ingredientDoubles): the same name, one inside the other, a typo apart. And
 * by an AI when one is set up, which also sees "Frühlingszwiebeln" and "green
 * onions" — as proposals to confirm one by one, never applied by itself.
 * Without an AI everything here still works by hand.
 */
export default function IngredientCatalog() {
    const t = useTranslations('Ingredients');
    const locale = useLocale() === 'en' ? 'en' : 'de';
    const [ask, dialog] = useConfirm();

    const [items, setItems] = useState<Item[] | null>(null);
    const [doubles, setDoubles] = useState<Double[]>([]);
    const [aiAvailable, setAiAvailable] = useState(false);
    const [unlinked, setUnlinked] = useState(0);
    const [query, setQuery] = useState('');
    const [view, setView] = useState<View | null>(null);
    const [shown, setShown] = useState(60);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [mergeSheet, setMergeSheet] = useState<number[] | null>(null);
    const [aiProposals, setAiProposals] = useState<{
        doubles: number[][];
        translations: { id: number; de: string; en: string }[];
    } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState('');

    const load = useCallback(async () => {
        const res = await fetch('/api/ingredients').catch(() => null);
        if (!res?.ok) {
            setNote(t('loadFailed'));
            return;
        }
        const data = (await res.json()) as {
            items: Item[];
            doubles: Double[];
            aiAvailable: boolean;
            unlinked: number;
        };
        setItems(data.items);
        setDoubles(data.doubles);
        setAiAvailable(data.aiAvailable);
        setUnlinked(data.unlinked);
    }, [t]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once, from the server
        void load();
    }, [load]);

    const byId = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
    const label = (item: Item | undefined) => (item ? (locale === 'de' ? item.de || item.en : item.en || item.de) : '');

    const call = async (key: string, init: RequestInit & { url?: string }) => {
        setBusy(key);
        setNote('');
        const res = await fetch(init.url ?? '/api/ingredients', {
            headers: { 'Content-Type': 'application/json' },
            ...init,
        }).catch(() => null);
        setBusy(null);
        if (!res?.ok) {
            setNote(sayable((await res?.json().catch(() => ({})))?.message, t('failed')));
            return null;
        }
        return res.json();
    };

    const merge = async (into: number, from: number[]) => {
        const done = await call(`merge-${into}`, {
            method: 'POST',
            body: JSON.stringify({ action: 'merge', into, from }),
        });
        if (!done) return;
        setMergeSheet(null);
        setSelected(new Set());
        setNote(t('merged', { name: label(byId.get(into)) }));
        await load();
    };

    const notDouble = async (pair: Double) => {
        if (
            await call(`not-${pair.a}-${pair.b}`, {
                method: 'POST',
                body: JSON.stringify({ action: 'notDouble', a: pair.a, b: pair.b }),
            })
        ) {
            setDoubles((current) => current.filter((other) => other !== pair));
        }
    };

    const remove = async (item: Item) => {
        if (
            !(await ask({
                title: t('deleteQuestion', { name: label(item) }),
                confirmLabel: t('delete'),
                destructive: true,
            }))
        )
            return;
        if (
            await call(`delete-${item.id}`, {
                method: 'DELETE',
                url: `/api/ingredients?id=${item.id}`,
            })
        )
            await load();
    };

    const linkAll = async () => {
        const done = (await call('link', {
            method: 'POST',
            body: JSON.stringify({ action: 'linkAll' }),
        })) as { rows: number } | null;
        if (done) {
            setNote(t('linked', { count: done.rows }));
            await load();
        }
    };

    const aiCheck = async () => {
        const done = (await call('aiCheck', {
            method: 'POST',
            body: JSON.stringify({ action: 'aiCheck' }),
        })) as typeof aiProposals;
        if (done) setAiProposals(done);
    };

    const aiTranslate = async () => {
        const done = (await call('aiTranslate', {
            method: 'POST',
            body: JSON.stringify({ action: 'aiTranslate' }),
        })) as { filled: number } | null;
        if (done) {
            setNote(t('translated', { count: done.filled }));
            await load();
        }
    };

    const all = items ?? [];
    const missing = all.filter((item) => !item.de || !item.en).length;
    const unused = all.filter((item) => item.uses === 0).length;
    const views: { id: View; count: number | null; attention?: boolean }[] = [
        { id: 'doubles', count: doubles.length, attention: true },
        { id: 'missing', count: missing, attention: true },
        { id: 'newest', count: null },
        { id: 'used', count: null },
        { id: 'unused', count: unused, attention: true },
        { id: 'all', count: all.length },
    ];
    // First what needs a look; with nothing to look at, the newest.
    const current: View = view ?? (doubles.length > 0 ? 'doubles' : missing > 0 ? 'missing' : 'newest');
    const viewHint = current === 'missing' ? t('hint_missing') : current === 'unused' ? t('hint_unused') : current === 'newest' ? t('hint_newest') : '';

    const q = query.trim().toLowerCase();
    const byName = (a: Item, b: Item) => label(a).localeCompare(label(b), locale);
    const visible = q
        ? all.filter((item) => [item.de, item.en, ...item.aliases].some((name) => name.toLowerCase().includes(q))).sort(byName)
        : current === 'missing'
          ? all.filter((item) => !item.de || !item.en).sort((a, b) => b.uses - a.uses)
          : current === 'newest'
            ? [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
            : current === 'used'
              ? [...all].sort((a, b) => b.uses - a.uses || byName(a, b))
              : current === 'unused'
                ? all.filter((item) => item.uses === 0).sort(byName)
                : [...all].sort(byName);

    const toggle = (id: number) =>
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const reason = (pair: Double) => t(`reason_${pair.reason}`);

    if (items === null) return <p className="text-muted">{note || t('loading')}</p>;

    return (
        <div>
            {dialog}
            <p className="font-serif text-muted">{t('intro')}</p>

            <p role="status" className={note ? 'mt-4 rounded-lg bg-surface px-3 py-2 text-sm' : 'sr-only'}>
                {note}
            </p>

            {/* The actions that work on the whole list. */}
            <div className="mt-5 flex flex-wrap gap-2">
                {unlinked > 0 && (
                    <button type="button" disabled={busy !== null} onClick={() => void linkAll()} className={buttonPrimarySmall}>
                        <BusyLabel busy={busy === 'link'}>{t('linkAll', { count: unlinked })}</BusyLabel>
                    </button>
                )}
                {aiAvailable && (
                    <button type="button" disabled={busy !== null} onClick={() => void aiCheck()} className={buttonSecondary}>
                        <BusyLabel busy={busy === 'aiCheck'}>{t('aiCheck')}</BusyLabel>
                    </button>
                )}
                {aiAvailable && missing > 0 && (
                    <button type="button" disabled={busy !== null} onClick={() => void aiTranslate()} className={buttonSecondary}>
                        <BusyLabel busy={busy === 'aiTranslate'}>{t('aiTranslate', { count: missing })}</BusyLabel>
                    </button>
                )}
            </div>
            {!aiAvailable && <p className="mt-2 text-sm text-faint">{t('noAi')}</p>}

            {aiProposals && (
                <section className="mt-8 rounded-xl border border-ink p-4">
                    <h2 className="font-bold">{t('aiProposals')}</h2>
                    {aiProposals.doubles.length === 0 && aiProposals.translations.length === 0 && <p className="mt-2 text-muted">{t('aiNothing')}</p>}
                    <ul className="mt-3 divide-y divide-line">
                        {aiProposals.doubles.map((group) => (
                            <li key={group.join('-')} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                <span>
                                    {group
                                        .map((id) => label(byId.get(id)))
                                        .filter(Boolean)
                                        .join(' = ')}
                                </span>
                                <button type="button" onClick={() => setMergeSheet(group)} className={buttonSecondary}>
                                    {t('mergeOne')}
                                </button>
                            </li>
                        ))}
                        {aiProposals.translations.map((row) => {
                            const item = byId.get(row.id);
                            if (!item) return null;
                            return (
                                <li key={`t-${row.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                    <span>
                                        {item.de || <em>{row.de}</em>} · {item.en || <em>{row.en}</em>}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void call(`save-${item.id}`, {
                                                method: 'PATCH',
                                                body: JSON.stringify({
                                                    id: item.id,
                                                    de: item.de || row.de,
                                                    en: item.en || row.en,
                                                    aliases: item.aliases,
                                                }),
                                            }).then((ok) => ok && load())
                                        }
                                        className={buttonSecondary}
                                    >
                                        {t('take')}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <button type="button" onClick={() => setAiProposals(null)} className="mt-2 min-h-11 text-sm text-muted underline underline-offset-4">
                        {t('close')}
                    </button>
                </section>
            )}

            {/*
                Views rather than one long list: what needs a look first
                (doubles, a missing language, unused ones), then the newest
                and the most used. A search looks through all of them.
            */}
            <section className="mt-8">
                <label htmlFor="ingredient-search" className="sr-only">
                    {t('search')}
                </label>
                <input
                    id="ingredient-search"
                    type="search"
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setShown(60);
                    }}
                    placeholder={t('searchAll', { count: items.length })}
                    className="w-full rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                />
                {!q && (
                    <div role="tablist" aria-label={t('views')} className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
                        {views.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                role="tab"
                                aria-selected={current === entry.id}
                                onClick={() => {
                                    setView(entry.id);
                                    setShown(60);
                                }}
                                className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm ${
                                    current === entry.id ? 'border-ink bg-ink text-page' : 'border-control text-muted hover:border-ink hover:text-ink'
                                }`}
                            >
                                {t(`view_${entry.id}`)}
                                {entry.count !== null && <span className={`text-xs ${entry.count > 0 && entry.attention ? 'font-semibold' : 'opacity-70'}`}>{entry.count}</span>}
                            </button>
                        ))}
                    </div>
                )}

                {!q && current === 'doubles' ? (
                    doubles.length === 0 ? (
                        <p className="mt-6 text-muted">{t('noDoubles')}</p>
                    ) : (
                        <>
                            <p className="mt-3 text-sm text-muted">{t('doublesExplain')}</p>
                            <ul className="mt-2 divide-y divide-line">
                                {doubles.slice(0, shown).map((pair) => (
                                    <li key={`${pair.a}-${pair.b}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                        <span>
                                            {label(byId.get(pair.a))} <span className="text-faint">↔</span> {label(byId.get(pair.b))}
                                            <span className="block text-xs text-faint">
                                                {reason(pair)} ·{' '}
                                                {t('uses', {
                                                    count: (byId.get(pair.a)?.uses ?? 0) + (byId.get(pair.b)?.uses ?? 0),
                                                })}
                                            </span>
                                        </span>
                                        <span className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => setMergeSheet([pair.a, pair.b])} className={buttonSecondary}>
                                                {t('mergeOne')}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy !== null}
                                                onClick={() => void notDouble(pair)}
                                                className="min-h-11 px-2 text-sm text-muted underline underline-offset-4"
                                            >
                                                {t('notDouble')}
                                            </button>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {doubles.length > shown && (
                                <button type="button" onClick={() => setShown((count) => count + 60)} className={`mt-4 ${buttonSecondary}`}>
                                    {t('more')}
                                </button>
                            )}
                        </>
                    )
                ) : (
                    <>
                        {(q || viewHint) && <p className="mt-3 text-sm text-muted">{q ? t('count', { count: visible.length, total: items.length }) : viewHint}</p>}
                        {visible.length === 0 ? (
                            <p className="mt-6 text-muted">{q ? t('nothingFound') : t('nothingHere')}</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-line border-y border-line">
                                {visible.slice(0, shown).map((item) => (
                                    <ItemRow
                                        key={`${item.id}-${item.de}-${item.en}-${item.aliases.join('|')}-${JSON.stringify(item.units)}`}
                                        item={item}
                                        locale={locale}
                                        detail={current === 'newest' && !q ? 'date' : 'uses'}
                                        selected={selected.has(item.id)}
                                        onSelect={() => toggle(item.id)}
                                        onSave={async (next) => {
                                            if (
                                                await call(`save-${item.id}`, {
                                                    method: 'PATCH',
                                                    body: JSON.stringify({ id: item.id, ...next }),
                                                })
                                            )
                                                await load();
                                        }}
                                        onDelete={() => void remove(item)}
                                    />
                                ))}
                            </ul>
                        )}
                        {visible.length > shown && (
                            <button type="button" onClick={() => setShown((count) => count + 100)} className={`mt-4 ${buttonSecondary}`}>
                                {t('more')}
                            </button>
                        )}
                    </>
                )}
            </section>

            {selected.size > 1 && (
                <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-3 rounded-full border border-line bg-page px-4 py-2 shadow-lg">
                    <span className="text-sm">{t('selected', { count: selected.size })}</span>
                    <span className="flex gap-2">
                        <button type="button" onClick={() => setSelected(new Set())} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                            {t('cancel')}
                        </button>
                        <button type="button" onClick={() => setMergeSheet([...selected])} className={buttonPrimarySmall}>
                            {t('mergeSelected')}
                        </button>
                    </span>
                </div>
            )}

            {mergeSheet && (
                <Sheet title={t('mergeTitle')} onClose={() => setMergeSheet(null)}>
                    <p className="text-sm text-muted">{t('mergeExplain')}</p>
                    <ul className="mt-3 flex flex-col gap-2">
                        {mergeSheet
                            .map((id) => byId.get(id))
                            .filter((item): item is Item => Boolean(item))
                            .map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        disabled={busy !== null}
                                        onClick={() =>
                                            void merge(
                                                item.id,
                                                mergeSheet.filter((id) => id !== item.id),
                                            )
                                        }
                                        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line px-3 text-left hover:border-ink disabled:opacity-50"
                                    >
                                        <span>
                                            {item.de || '—'} · {item.en || '—'}
                                            <span className="block text-xs text-faint">{t('uses', { count: item.uses })}</span>
                                        </span>
                                        <span className="text-sm font-medium">{t('keepThis')}</span>
                                    </button>
                                </li>
                            ))}
                    </ul>
                </Sheet>
            )}
        </div>
    );
}

/** One ingredient: its two names and further ones, saved when changed. */
function ItemRow({
    item,
    locale,
    detail,
    selected,
    onSelect,
    onSave,
    onDelete,
}: {
    item: Item;
    locale: 'de' | 'en';
    /** What the closed row says beside the names: how much it is used, or when it came. */
    detail: 'uses' | 'date';
    selected: boolean;
    onSelect: () => void;
    onSave: (next: { de: string; en: string; aliases: string[]; units?: Units | null }) => Promise<void>;
    onDelete: () => void;
}) {
    const t = useTranslations('Ingredients');
    const [open, setOpen] = useState(false);
    const [de, setDe] = useState(item.de);
    const [en, setEn] = useState(item.en);
    const [aliases, setAliases] = useState(item.aliases.join(', '));
    const [saving, setSaving] = useState(false);
    const dirty = de !== item.de || en !== item.en || aliases !== item.aliases.join(', ');
    const field = 'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none focus:border-ink';

    const first = locale === 'de' ? item.de : item.en;
    const second = locale === 'de' ? item.en : item.de;
    const head = (
        <div className="flex items-center gap-2">
            <button
                type="button"
                role="checkbox"
                aria-checked={selected}
                aria-label={t('selectName', { name: first || second })}
                onClick={onSelect}
                className="flex h-11 w-9 shrink-0 items-center justify-center"
            >
                <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${selected ? 'border-transparent bg-ink text-page' : 'border-control'}`}>
                    {selected ? '✓' : ''}
                </span>
            </button>
            <button type="button" aria-expanded={open} onClick={() => setOpen((on) => !on)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                    <span className="block truncate">{first || <span className="text-danger">{t(locale === 'de' ? 'germanMissing' : 'englishMissing')}</span>}</span>
                    <span className="block truncate text-xs text-faint">
                        {second || <span className="text-danger">{t(locale === 'de' ? 'englishMissing' : 'germanMissing')}</span>}
                        {item.aliases.length > 0 && ` · ${item.aliases.join(', ')}`}
                    </span>
                </span>
                <span className="shrink-0 text-xs text-faint">
                    {detail === 'date'
                        ? new Intl.DateTimeFormat(locale, {
                              day: 'numeric',
                              month: 'short',
                          }).format(new Date(item.createdAt))
                        : t('usesShort', { count: item.uses })}
                </span>
                <span aria-hidden className={`shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`}>
                    ›
                </span>
            </button>
        </div>
    );
    if (!open) return <li className={selected ? 'bg-surface' : ''}>{head}</li>;

    return (
        <li className={`pb-3 ${selected ? 'bg-surface' : ''}`}>
            {head}
            <div className="grid gap-2 pl-11 sm:grid-cols-2">
                <label className="text-xs text-muted">
                    {t('german')}
                    <input value={de} onChange={(event) => setDe(event.target.value)} className={`${field} mt-1 text-base text-ink`} placeholder={t('missing')} />
                </label>
                <label className="text-xs text-muted">
                    {t('english')}
                    <input value={en} onChange={(event) => setEn(event.target.value)} className={`${field} mt-1 text-base text-ink`} placeholder={t('missing')} />
                </label>
                <label className="text-xs text-muted sm:col-span-2">
                    {t('aliases')}
                    <input value={aliases} onChange={(event) => setAliases(event.target.value)} className={`${field} mt-1 text-sm text-ink`} placeholder={t('aliasesPlaceholder')} />
                </label>
            </div>
            <div className="pl-11">
                <UnitsEditor units={item.units} own={item.ownUnits} locale={locale} onSave={(units) => onSave({ de: item.de, en: item.en, aliases: item.aliases, units })} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11">
                <span className="text-xs text-faint">{t('uses', { count: item.uses })}</span>
                <span className="ml-auto flex gap-2">
                    {item.uses === 0 && (
                        <button type="button" onClick={onDelete} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-danger">
                            {t('delete')}
                        </button>
                    )}
                    {dirty && (
                        <button
                            type="button"
                            disabled={saving || (!de.trim() && !en.trim())}
                            onClick={async () => {
                                setSaving(true);
                                await onSave({
                                    de: de.trim(),
                                    en: en.trim(),
                                    aliases: aliases
                                        .split(',')
                                        .map((name) => name.trim())
                                        .filter(Boolean),
                                });
                                setSaving(false);
                            }}
                            className={buttonPrimarySmall}
                        >
                            <BusyLabel busy={saving}>{t('save')}</BusyLabel>
                        </button>
                    )}
                </span>
            </div>
        </li>
    );
}

/**
 * What the shopping list converts this ingredient with: the unit it is bought
 * in, and "7 Stück = 1 Bund" per other unit (lib/unitConversion). Shown as a
 * line; written as text, one conversion per line.
 */
function UnitsEditor({ units, own, locale, onSave }: { units: Units | null; own: boolean; locale: 'de' | 'en'; onSave: (units: Units | null) => Promise<void> }) {
    const t = useTranslations('Ingredients');
    const [open, setOpen] = useState(false);
    const [buy, setBuy] = useState(units ? buyLabel(units.buy, locale) : '');
    const [lines, setLines] = useState(units ? conversionLines(units, locale).join('\n') : '');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const field = 'w-full rounded-lg border border-control bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-ink';

    const save = async (next: Units | null) => {
        setSaving(true);
        await onSave(next);
        setSaving(false);
        setOpen(false);
    };

    if (!open) {
        return (
            <p className="mt-2 text-xs text-muted">
                {units ? `${t('buyUnit')}: ${buyLabel(units.buy, locale)}${Object.keys(units.factors).length ? ` · ${conversionLines(units, locale).join(' · ')}` : ''}` : t('noUnits')}{' '}
                <button type="button" onClick={() => setOpen(true)} className="min-h-8 underline underline-offset-4 hover:text-ink">
                    {t('editUnits')}
                </button>
            </p>
        );
    }

    return (
        <div className="mt-3 rounded-lg bg-surface p-3">
            <label className="block text-xs text-muted">
                {t('buyUnit')}
                <input value={buy} onChange={(event) => setBuy(event.target.value)} className={`${field} mt-1`} placeholder={t('buyUnitPlaceholder')} />
            </label>
            <label className="mt-2 block text-xs text-muted">
                {t('conversions')}
                <textarea value={lines} onChange={(event) => setLines(event.target.value)} rows={3} className={`${field} mt-1`} placeholder={t('conversionsPlaceholder')} />
            </label>
            {error && <p className="mt-1 text-sm text-danger">{t('unitsUnreadable', { line: error })}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                        const read = readConversion(buy, lines.split('\n'));
                        if ('error' in read) return setError(read.error);
                        setError('');
                        void save(read.units);
                    }}
                    className={buttonPrimarySmall}
                >
                    <BusyLabel busy={saving}>{t('save')}</BusyLabel>
                </button>
                <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                    {t('cancel')}
                </button>
                {own && (
                    <button type="button" disabled={saving} onClick={() => void save(null)} className="ml-auto min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                        {t('resetUnits')}
                    </button>
                )}
            </div>
        </div>
    );
}
