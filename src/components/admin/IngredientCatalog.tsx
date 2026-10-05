'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { sayable } from '@/lib/apiMessage';
import { useConfirm } from '@/components/ui/useConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import Sheet from '@/components/ui/Sheet';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';

interface Item {
    id: number;
    de: string;
    en: string;
    aliases: string[];
    uses: number;
}

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
    const [onlyMissing, setOnlyMissing] = useState(false);
    const [shown, setShown] = useState(60);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [mergeSheet, setMergeSheet] = useState<number[] | null>(null);
    const [aiProposals, setAiProposals] = useState<{ doubles: number[][]; translations: { id: number; de: string; en: string }[] } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState('');

    const load = useCallback(async () => {
        const res = await fetch('/api/ingredients').catch(() => null);
        if (!res?.ok) {
            setNote(t('loadFailed'));
            return;
        }
        const data = (await res.json()) as { items: Item[]; doubles: Double[]; aiAvailable: boolean; unlinked: number };
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
        const res = await fetch(init.url ?? '/api/ingredients', { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null);
        setBusy(null);
        if (!res?.ok) {
            setNote(sayable((await res?.json().catch(() => ({})))?.message, t('failed')));
            return null;
        }
        return res.json();
    };

    const merge = async (into: number, from: number[]) => {
        const done = await call(`merge-${into}`, { method: 'POST', body: JSON.stringify({ action: 'merge', into, from }) });
        if (!done) return;
        setMergeSheet(null);
        setSelected(new Set());
        setNote(t('merged', { name: label(byId.get(into)) }));
        await load();
    };

    const notDouble = async (pair: Double) => {
        if (await call(`not-${pair.a}-${pair.b}`, { method: 'POST', body: JSON.stringify({ action: 'notDouble', a: pair.a, b: pair.b }) })) {
            setDoubles((current) => current.filter((other) => other !== pair));
        }
    };

    const remove = async (item: Item) => {
        if (!(await ask({ title: t('deleteQuestion', { name: label(item) }), confirmLabel: t('delete'), destructive: true }))) return;
        if (await call(`delete-${item.id}`, { method: 'DELETE', url: `/api/ingredients?id=${item.id}` })) await load();
    };

    const linkAll = async () => {
        const done = (await call('link', { method: 'POST', body: JSON.stringify({ action: 'linkAll' }) })) as { rows: number } | null;
        if (done) {
            setNote(t('linked', { count: done.rows }));
            await load();
        }
    };

    const aiCheck = async () => {
        const done = (await call('aiCheck', { method: 'POST', body: JSON.stringify({ action: 'aiCheck' }) })) as typeof aiProposals;
        if (done) setAiProposals(done);
    };

    const aiTranslate = async () => {
        const done = (await call('aiTranslate', { method: 'POST', body: JSON.stringify({ action: 'aiTranslate' }) })) as { filled: number } | null;
        if (done) {
            setNote(t('translated', { count: done.filled }));
            await load();
        }
    };

    const missing = (items ?? []).filter((item) => !item.de || !item.en).length;
    const q = query.trim().toLowerCase();
    const visible = (items ?? []).filter(
        (item) =>
            (!onlyMissing || !item.de || !item.en) &&
            (!q || [item.de, item.en, ...item.aliases].some((name) => name.toLowerCase().includes(q)))
    );

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
                                <span>{group.map((id) => label(byId.get(id))).filter(Boolean).join(' = ')}</span>
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
                                                body: JSON.stringify({ id: item.id, de: item.de || row.de, en: item.en || row.en, aliases: item.aliases }),
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

            {doubles.length > 0 && (
                <section className="mt-8">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{t('doubles', { count: doubles.length })}</h2>
                    <p className="mt-1 text-sm text-muted">{t('doublesExplain')}</p>
                    <ul className="mt-2 divide-y divide-line">
                        {doubles.slice(0, 30).map((pair) => (
                            <li key={`${pair.a}-${pair.b}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                <span>
                                    {label(byId.get(pair.a))} <span className="text-faint">↔</span> {label(byId.get(pair.b))}
                                    <span className="block text-xs text-faint">{reason(pair)}</span>
                                </span>
                                <span className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setMergeSheet([pair.a, pair.b])} className={buttonSecondary}>
                                        {t('mergeOne')}
                                    </button>
                                    <button type="button" disabled={busy !== null} onClick={() => void notDouble(pair)} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                                        {t('notDouble')}
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="mt-10">
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="ingredient-search" className="sr-only">
                        {t('search')}
                    </label>
                    <input
                        id="ingredient-search"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('search')}
                        className="min-w-0 flex-1 rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                    />
                    <button
                        type="button"
                        aria-pressed={onlyMissing}
                        onClick={() => setOnlyMissing((on) => !on)}
                        className={`min-h-11 rounded-full border px-4 text-sm ${onlyMissing ? 'border-ink bg-ink text-page' : 'border-control text-muted'}`}
                    >
                        {t('onlyMissing', { count: missing })}
                    </button>
                </div>
                <p className="mt-2 text-sm text-faint">{t('count', { count: visible.length, total: items.length })}</p>

                <ul className="mt-3 flex flex-col gap-3">
                    {visible.slice(0, shown).map((item) => (
                        <ItemRow
                            key={`${item.id}-${item.de}-${item.en}-${item.aliases.join('|')}`}
                            item={item}
                            selected={selected.has(item.id)}
                            onSelect={() => toggle(item.id)}
                            onSave={async (next) => {
                                if (await call(`save-${item.id}`, { method: 'PATCH', body: JSON.stringify({ id: item.id, ...next }) })) await load();
                            }}
                            onDelete={() => void remove(item)}
                        />
                    ))}
                </ul>
                {visible.length > shown && (
                    <button type="button" onClick={() => setShown((count) => count + 100)} className={`mt-4 ${buttonSecondary}`}>
                        {t('more')}
                    </button>
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
                                        onClick={() => void merge(item.id, mergeSheet.filter((id) => id !== item.id))}
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
    selected,
    onSelect,
    onSave,
    onDelete,
}: {
    item: Item;
    selected: boolean;
    onSelect: () => void;
    onSave: (next: { de: string; en: string; aliases: string[] }) => Promise<void>;
    onDelete: () => void;
}) {
    const t = useTranslations('Ingredients');
    const [de, setDe] = useState(item.de);
    const [en, setEn] = useState(item.en);
    const [aliases, setAliases] = useState(item.aliases.join(', '));
    const [saving, setSaving] = useState(false);
    const dirty = de !== item.de || en !== item.en || aliases !== item.aliases.join(', ');
    const field = 'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none focus:border-ink';

    return (
        <li className={`rounded-xl border p-3 ${selected ? 'border-ink' : 'border-line'}`}>
            <div className="grid gap-2 sm:grid-cols-2">
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
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <button type="button" role="checkbox" aria-checked={selected} onClick={onSelect} className="flex min-h-11 items-center gap-2 text-sm">
                    <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-md border ${selected ? 'border-transparent bg-ink text-page' : 'border-control'}`}>
                        {selected ? '✓' : ''}
                    </span>
                    {t('select')}
                </button>
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
                                await onSave({ de: de.trim(), en: en.trim(), aliases: aliases.split(',').map((name) => name.trim()).filter(Boolean) });
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
