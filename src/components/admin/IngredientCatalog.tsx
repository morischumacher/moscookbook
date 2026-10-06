'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { sayable } from '@/lib/apiMessage';
import { useConfirm } from '@/components/ui/useConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import Sheet from '@/components/ui/Sheet';
import { Link } from '@/i18n/routing';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';
import { CHOOSABLE_AISLES } from '@/lib/shopping';
import { unitLabel, type UnitUse } from '@/lib/ingredientUnits';
import { UNIT_CHOICES } from '@/lib/unitChoice';
import type { AiDecision } from '@/lib/ingredientDecideDb';

/** A further unit on a card, with its conversion to the main one ("7 Stück = 1 Bund"). */
interface CardUnit {
    family: string;
    unit: string;
    a: number | null;
    b: number | null;
}

interface Item {
    id: number;
    de: string;
    en: string;
    aliases: string[];
    uses: number;
    onLists: number;
    /** Part of the starting stock: kept even when no recipe uses it. */
    stock: boolean;
    createdAt: string;
    aisle: string | null;
    ruleAisle: string;
    /** The main unit ('g', 'bunch', '' for pieces), set or the most used; null with no recipe and none set. */
    main: string | null;
    mainChosen: boolean;
    units: CardUnit[];
    unitUses: UnitUse[];
}

interface DoubleQuestion {
    a: number;
    b: number;
    reason: 'sameName' | 'contained' | 'typo' | 'ai';
}

interface UnitQuestion {
    itemId: number;
    family: string;
    unit: string;
    main: string;
    keepable: boolean;
    proposal: { a: number; b: number } | null;
    rows: { rowId: number; amount: string; name: string; title: string; slug: string }[];
}

type View = 'decide' | 'newest' | 'used' | 'missing' | 'unused' | 'all';

/** Further names are one list; a German one has a capitalised word ("gelbe Zwiebel") or an umlaut, an English one neither. */
const isGermanName = (name: string) => /(^|[\s-])[A-ZÄÖÜ]/.test(name) || /[äöüß]/i.test(name);

/**
 * The cookbook's ingredients, one card each:
 *
 *     Frühlingszwiebeln        auch: Lauchzwiebel
 *     spring onions            auch: scallion, green onion
 *     Einheiten: Bund (main) · 7 Stück = 1 Bund · 100 g = 1 Bund
 *
 * and what there is to decide about them, in two kinds of question only —
 * "the same ingredient?" and "a new unit?" (lib/ingredientDecideDb) — each
 * with its two answers and "let the AI decide", and all of them at once
 * with one tap. The rest are views to browse: newest, most used, without a
 * translation, unused, all.
 */
export default function IngredientCatalog() {
    const t = useTranslations('Ingredients');
    const locale = useLocale() === 'en' ? 'en' : 'de';
    const [ask, dialog] = useConfirm();
    const router = useRouter();

    const [items, setItems] = useState<Item[] | null>(null);
    const [doubles, setDoubles] = useState<DoubleQuestion[]>([]);
    const [unitQuestions, setUnitQuestions] = useState<UnitQuestion[]>([]);
    const [aiAvailable, setAiAvailable] = useState(false);
    const [unlinked, setUnlinked] = useState(0);
    const [query, setQuery] = useState('');
    const [view, setView] = useState<View | null>(null);
    const [shown, setShown] = useState(60);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [mergeSheet, setMergeSheet] = useState<number[] | null>(null);
    const [decisions, setDecisions] = useState<AiDecision[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState('');

    const load = useCallback(async () => {
        const res = await fetch('/api/ingredients', { cache: 'no-store' }).catch(() => null);
        if (!res?.ok) {
            setNote(t('loadFailed'));
            return;
        }
        const data = (await res.json()) as { items: Item[]; questions: { doubles: DoubleQuestion[]; units: UnitQuestion[] }; aiAvailable: boolean; unlinked: number };
        setItems(data.items);
        setDoubles(data.questions.doubles);
        setUnitQuestions(data.questions.units);
        setAiAvailable(data.aiAvailable);
        setUnlinked(data.unlinked);
    }, [t]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once, from the server
        void load();
    }, [load]);

    const byId = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
    const label = (item: Item | undefined) => (item ? (locale === 'de' ? item.de || item.en : item.en || item.de) : '');

    const request = async (key: string, init: RequestInit) => {
        setBusy(key);
        setNote('');
        const res = await fetch('/api/ingredients', { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null);
        setBusy(null);
        if (!res?.ok) {
            setNote(sayable((await res?.json().catch(() => ({})))?.message, t('failed')));
            return null;
        }
        return res.json();
    };
    const post = (key: string, body: object) => request(key, { method: 'POST', body: JSON.stringify(body) });
    // After every change: the list again, and the admin menu's count of questions (counted by the server).
    const refresh = async () => {
        await load();
        router.refresh();
    };

    const merge = async (into: number, from: number[]) => {
        if (!(await post(`merge-${into}`, { action: 'merge', into, from }))) return;
        setMergeSheet(null);
        setSelected(new Set());
        setNote(t('merged', { name: label(byId.get(into)) }));
        await refresh();
    };

    const act = async (key: string, body: object, done?: string) => {
        const answer = (await post(key, body)) as { recipes?: number; skipped?: number } | null;
        if (!answer) return;
        if (done) setNote(done);
        else if (answer.recipes) setNote(t('rowsConverted', { count: answer.recipes, skipped: answer.skipped ?? 0 }));
        await refresh();
    };

    /** Questions left to the AI: all of them, or one; and with all, the missing translations too. */
    const aiResolve = async (body: object, key: string) => {
        const done = (await post(key, { action: 'aiResolve', ...body })) as { decisions: AiDecision[]; left: number } | null;
        if (!done) return;
        if (key === 'ai-all' && (items ?? []).some((item) => !item.de || !item.en)) await post('ai-all', { action: 'aiTranslate' });
        setDecisions((current) => [...done.decisions, ...(key === 'ai-all' ? [] : (current ?? []))]);
        if (done.left > 0) setNote(t('aiLeft', { count: done.left }));
        await refresh();
    };

    const undo = async (decision: AiDecision, index: number) => {
        if (decision.kind === 'kept') await post(`undo-${index}`, { action: 'removeUnit', id: decision.itemId, family: decision.family });
        else if (decision.kind === 'different') await post(`undo-${index}`, { action: 'sameAgain', a: decision.a, b: decision.b });
        else if (decision.kind === 'converted') for (const row of decision.undo) await post(`undo-${index}`, { action: 'setRowAmount', rowId: row.rowId, amount: row.amount });
        setDecisions((current) => (current ?? []).filter((_, at) => at !== index));
        await refresh();
    };

    const remove = async (item: Item) => {
        if (!(await ask({ title: t('deleteQuestion', { name: label(item) }), confirmLabel: t('delete'), destructive: true }))) return;
        setBusy(`delete-${item.id}`);
        const res = await fetch(`/api/ingredients?id=${item.id}`, { method: 'DELETE' }).catch(() => null);
        setBusy(null);
        if (!res?.ok) setNote(sayable((await res?.json().catch(() => ({})))?.message, t('failed')));
        else await refresh();
    };

    const removeUnused = async (count: number) => {
        if (!(await ask({ title: t('deleteUnusedQuestion', { count }), confirmLabel: t('delete'), destructive: true }))) return;
        const done = (await post('deleteUnused', { action: 'deleteUnused' })) as { deleted: number } | null;
        if (done) {
            setNote(t('deletedUnused', { count: done.deleted }));
            await refresh();
        }
    };

    const all = items ?? [];
    const missing = all.filter((item) => !item.de || !item.en).length;
    const unused = all.filter((item) => item.uses === 0 && item.onLists === 0 && !item.stock);
    const questionCount = doubles.length + unitQuestions.length;
    const views: { id: View; count: number | null; attention?: boolean }[] = [
        { id: 'decide', count: questionCount, attention: true },
        { id: 'newest', count: null },
        { id: 'used', count: null },
        { id: 'missing', count: missing, attention: true },
        { id: 'unused', count: unused.length, attention: true },
        { id: 'all', count: all.length },
    ];
    // First what needs a decision; with nothing to decide, the newest.
    const current: View = view ?? (questionCount > 0 ? 'decide' : 'newest');
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
                ? [...unused].sort(byName)
                : [...all].sort(byName);

    const toggle = (id: number) =>
        setSelected((now) => {
            const next = new Set(now);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    if (items === null) return <p className="text-muted">{note || t('loading')}</p>;

    return (
        <div>
            {dialog}
            <p className="font-serif text-muted">{t('introCard')}</p>

            <p role="status" className={note ? 'mt-4 rounded-lg bg-surface px-3 py-2 text-sm' : 'sr-only'}>
                {note}
            </p>

            {unlinked > 0 && (
                <button type="button" disabled={busy !== null} onClick={() => void act('link', { action: 'linkAll' })} className={`mt-5 ${buttonPrimarySmall}`}>
                    <BusyLabel busy={busy === 'link'}>{t('linkAll', { count: unlinked })}</BusyLabel>
                </button>
            )}

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

                {!q && current === 'decide' ? (
                    <div className="mt-4">
                        {/* What the AI decided last, each undoable where that is possible. */}
                        {decisions && decisions.length > 0 && (
                            <section className="mb-6 rounded-xl border border-ink p-4">
                                <h2 className="font-bold">{t('aiDecided')}</h2>
                                <ul className="mt-2 divide-y divide-line text-sm">
                                    {decisions.map((decision, index) => (
                                        <li key={index} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                            <span>{describe(decision, t, locale)}</span>
                                            {decision.kind !== 'merged' && decision.kind !== 'open' && (
                                                <button
                                                    type="button"
                                                    disabled={busy !== null}
                                                    onClick={() => void undo(decision, index)}
                                                    className="min-h-11 px-2 text-muted underline underline-offset-4 hover:text-ink"
                                                >
                                                    {t('undo')}
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <button type="button" onClick={() => setDecisions(null)} className="mt-1 min-h-11 text-sm text-muted underline underline-offset-4">
                                    {t('close')}
                                </button>
                            </section>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-muted">{questionCount === 0 ? t('nothingToDecide') : t('decideExplain')}</p>
                            {questionCount > 0 && (
                                <button
                                    type="button"
                                    disabled={busy !== null || !aiAvailable}
                                    title={aiAvailable ? undefined : t('noAiShort')}
                                    onClick={() => void aiResolve({}, 'ai-all')}
                                    className={buttonPrimarySmall}
                                >
                                    <BusyLabel busy={busy === 'ai-all'}>{t('aiAll', { count: questionCount })}</BusyLabel>
                                </button>
                            )}
                        </div>
                        {!aiAvailable && questionCount > 0 && <p className="mt-1 text-xs text-faint">{t('noAiShort')}</p>}

                        <ul className="mt-3 flex flex-col gap-3">
                            {doubles.slice(0, shown).map((pair) => {
                                const a = byId.get(pair.a);
                                const b = byId.get(pair.b);
                                if (!a || !b) return null;
                                const [keep, gone] = a.uses >= b.uses ? [a, b] : [b, a];
                                return (
                                    <li key={`d-${pair.a}-${pair.b}`} className="rounded-xl border border-line p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('qSame')}</p>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                            <MiniCard item={a} locale={locale} />
                                            <MiniCard item={b} locale={locale} />
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button type="button" disabled={busy !== null} onClick={() => void merge(keep.id, [gone.id])} className={buttonSecondary}>
                                                {t('qMerge', { name: label(keep) })}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy !== null}
                                                onClick={() => void act(`nd-${pair.a}`, { action: 'notDouble', a: pair.a, b: pair.b })}
                                                className={buttonSecondary}
                                            >
                                                {t('qDifferent')}
                                            </button>
                                            <AiButton busy={busy} id={`ai-d-${pair.a}-${pair.b}`} available={aiAvailable} onClick={(key) => void aiResolve({ double: [pair.a, pair.b] }, key)} />
                                        </div>
                                    </li>
                                );
                            })}
                            {unitQuestions.slice(0, shown).map((question) => {
                                const item = byId.get(question.itemId);
                                if (!item) return null;
                                return (
                                    <UnitQuestionCard
                                        key={`u-${question.itemId}-${question.family}`}
                                        question={question}
                                        item={item}
                                        name={label(item)}
                                        locale={locale}
                                        busy={busy}
                                        aiAvailable={aiAvailable}
                                        onResolve={(choice, a, b) => void act(`uq-${question.itemId}`, { action: 'resolveUnit', id: item.id, unit: question.unit, a, b, choice })}
                                        onRow={(rowId, amount) => void act(`row-${rowId}`, { action: 'setRowAmount', rowId, amount }, t('rowReplaced'))}
                                        onAi={(key) => void aiResolve({ unit: { itemId: item.id, family: question.family } }, key)}
                                    />
                                );
                            })}
                        </ul>

                        {/* The rules find doubles by spelling; the AI also sees "Frühlingszwiebeln" and "green onions". */}
                        {aiAvailable && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void act('aiCheck', { action: 'aiCheck' }, t('aiChecked'))}
                                className="mt-4 min-h-11 text-sm text-muted underline underline-offset-4 hover:text-ink"
                            >
                                <BusyLabel busy={busy === 'aiCheck'}>{t('aiCheck')}</BusyLabel>
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {(q || viewHint) && <p className="mt-3 text-sm text-muted">{q ? t('count', { count: visible.length, total: items.length }) : viewHint}</p>}
                        {!q && current === 'missing' && missing > 0 && aiAvailable && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void act('aiTranslate', { action: 'aiTranslate' }, t('translatedDone'))}
                                className={`mt-2 ${buttonSecondary}`}
                            >
                                <BusyLabel busy={busy === 'aiTranslate'}>{t('aiTranslate', { count: missing })}</BusyLabel>
                            </button>
                        )}
                        {!q && current === 'unused' && unused.length > 0 && (
                            <button type="button" disabled={busy !== null} onClick={() => void removeUnused(unused.length)} className={`mt-2 ${buttonSecondary}`}>
                                <BusyLabel busy={busy === 'deleteUnused'}>{t('deleteUnused', { count: unused.length })}</BusyLabel>
                            </button>
                        )}
                        {visible.length === 0 ? (
                            <p className="mt-6 text-muted">{q ? t('nothingFound') : t('nothingHere')}</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-line border-y border-line">
                                {visible.slice(0, shown).map((item) => (
                                    <ItemRow
                                        key={`${item.id}-${item.de}-${item.en}-${item.aliases.join('|')}-${item.main}-${JSON.stringify(item.units)}`}
                                        item={item}
                                        locale={locale}
                                        detail={current === 'newest' && !q ? 'date' : 'uses'}
                                        selected={selected.has(item.id)}
                                        busy={busy !== null}
                                        onSelect={() => toggle(item.id)}
                                        onSave={(next) => request(`save-${item.id}`, { method: 'PATCH', body: JSON.stringify({ id: item.id, ...next }) }).then((ok) => ok && refresh())}
                                        onMain={(unit) => void act(`main-${item.id}`, { action: 'setMain', id: item.id, unit })}
                                        onUnits={(main, rows) => void act(`units-${item.id}`, { action: 'saveUnits', id: item.id, main, rows }, t('unitsSaved'))}
                                        onDelete={() => void remove(item)}
                                    />
                                ))}
                            </ul>
                        )}
                    </>
                )}
                {((current === 'decide' && !q && questionCount > shown) || ((current !== 'decide' || q) && visible.length > shown)) && (
                    <button type="button" onClick={() => setShown((count) => count + 60)} className={`mt-4 ${buttonSecondary}`}>
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

/** What the AI decided, in a sentence. */
function describe(decision: AiDecision, t: ReturnType<typeof useTranslations>, locale: 'de' | 'en'): string {
    switch (decision.kind) {
        case 'merged':
            return t('aiMerged', { from: decision.from, into: decision.into });
        case 'different':
            return t('aiDifferent', { a: decision.names[0], b: decision.names[1] });
        case 'kept':
            return t('aiKept', {
                name: decision.name,
                conversion: `${decision.a} ${unitLabel(decision.unit, locale, decision.a > 1)} = ${decision.b} ${unitLabel(decision.main, locale, decision.b > 1)}`,
            });
        case 'converted':
            return t('aiConverted', {
                name: decision.name,
                count: decision.recipes,
                conversion: `${decision.a} ${unitLabel(decision.unit, locale, decision.a > 1)} = ${decision.b} ${unitLabel(decision.main, locale, decision.b > 1)}`,
            });
        default:
            return t('aiOpen', { name: decision.name });
    }
}

/** "Let the AI decide", on every question; greyed out without an AI. */
function AiButton({ busy, id, available, onClick }: { busy: string | null; id: string; available: boolean; onClick: (key: string) => void }) {
    const t = useTranslations('Ingredients');
    return (
        <button type="button" disabled={busy !== null || !available} title={available ? undefined : t('noAiShort')} onClick={() => onClick(id)} className={buttonSecondary}>
            <BusyLabel busy={busy === id}>{t('aiDecide')}</BusyLabel>
        </button>
    );
}

/** A card in short, to compare two of them. */
function MiniCard({ item, locale }: { item: Item; locale: 'de' | 'en' }) {
    const t = useTranslations('Ingredients');
    const de = item.aliases.filter(isGermanName);
    const en = item.aliases.filter((alias) => !isGermanName(alias));
    return (
        <div className="rounded-lg bg-surface p-3 text-sm">
            <p>
                <span className="font-medium">{item.de || '—'}</span>
                {de.length > 0 && <span className="text-muted"> · {t('also', { names: de.join(', ') })}</span>}
            </p>
            <p>
                <span className="font-medium">{item.en || '—'}</span>
                {en.length > 0 && <span className="text-muted"> · {t('also', { names: en.join(', ') })}</span>}
            </p>
            <p className="mt-1 text-xs text-faint">
                {item.main !== null ? `${t('mainUnit')}: ${unitLabel(item.main, locale)} · ` : ''}
                {t('uses', { count: item.uses })}
            </p>
        </div>
    );
}

/**
 * "A new unit?": recipes write an ingredient in a unit its card does not
 * know. The conversion first (proposed where it is known), then: convert
 * those recipes to the main unit, take the unit onto the card, or the AI.
 */
function UnitQuestionCard({
    question,
    item,
    name,
    locale,
    busy,
    aiAvailable,
    onResolve,
    onRow,
    onAi,
}: {
    question: UnitQuestion;
    item: Item;
    name: string;
    locale: 'de' | 'en';
    busy: string | null;
    aiAvailable: boolean;
    onResolve: (choice: 'convert' | 'keep', a: number, b: number) => void;
    onRow: (rowId: number, amount: string) => void;
    onAi: (key: string) => void;
}) {
    const t = useTranslations('Ingredients');
    const [a, setA] = useState(question.proposal ? String(question.proposal.a) : '1');
    const [b, setB] = useState(question.proposal ? String(question.proposal.b).replace('.', ',') : '');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [draft, setDraft] = useState('');
    const number = (text: string) => Number(text.replace(',', '.'));
    const ready = number(a) > 0 && number(b) > 0;
    const unit = unitLabel(question.unit, locale);
    const main = unitLabel(question.main, locale);
    const field = 'w-20 rounded-lg border border-control bg-transparent px-2 py-1 text-base outline-none focus:border-ink';
    return (
        <li className="rounded-xl border border-line p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('qUnit')}</p>
            <p className="mt-1">
                <span className="font-medium">{name}</span>{' '}
                <span className="text-muted">
                    · {t('mainUnit')}: {main}
                </span>
            </p>
            {/* Where: the rows themselves, in sight — three, and the rest a tap away. */}
            <p className="mt-2 text-sm text-muted">{t('qUnitRecipes', { count: question.rows.length, unit })}:</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
                {(open ? question.rows : question.rows.slice(0, 3)).map((row) => (
                    <li key={row.rowId} className="flex flex-wrap items-center gap-x-2">
                        {editing === row.rowId ? (
                            <form
                                className="flex w-full flex-wrap items-center gap-2 py-1"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!draft.trim()) return;
                                    onRow(row.rowId, draft.trim());
                                    setEditing(null);
                                }}
                            >
                                <input
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    aria-label={t('rowAmount', { recipe: row.title })}
                                    placeholder={t('rowAmountPlaceholder')}
                                    autoFocus
                                    className={`${field} w-32`}
                                />
                                <span className="text-muted">{row.name}</span>
                                <button type="submit" disabled={busy !== null || !draft.trim()} className={buttonPrimarySmall}>
                                    {t('save')}
                                </button>
                                <button type="button" onClick={() => setEditing(null)} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                                    {t('cancel')}
                                </button>
                            </form>
                        ) : (
                            <>
                                <span>
                                    <span className="font-medium">{row.amount || '—'}</span> {row.name}
                                </span>
                                <span className="text-faint">·</span>
                                <Link href={`/recipe/${row.slug}`} target="_blank" className="min-h-8 text-muted underline underline-offset-4 hover:text-ink">
                                    {row.title}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditing(row.rowId);
                                        setDraft(row.amount);
                                    }}
                                    className="min-h-8 px-1 text-muted underline underline-offset-4 hover:text-ink"
                                >
                                    {t('replaceRow')}
                                </button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {question.rows.length > 3 && (
                <button type="button" aria-expanded={open} onClick={() => setOpen((on) => !on)} className="mt-1 min-h-9 text-sm text-muted underline underline-offset-4 hover:text-ink">
                    {open ? t('fewer') : t('moreRows', { count: question.rows.length - 3 })}
                </button>
            )}
            {/* The conversion both answers need: proposed where known, always editable. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <input value={a} onChange={(event) => setA(event.target.value)} inputMode="decimal" aria-label={t('convA', { unit })} className={field} />
                <span>{unit} =</span>
                <input value={b} onChange={(event) => setB(event.target.value)} inputMode="decimal" aria-label={t('convB', { unit: main })} placeholder="?" className={field} />
                <span>{main}</span>
            </div>
            {!ready && <p className="mt-1 text-xs text-faint">{t('convMissing')}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null || !ready} onClick={() => onResolve('convert', number(a), number(b))} className={buttonSecondary}>
                    {t('qConvert', { unit: main })}
                </button>
                {question.keepable && (
                    <button type="button" disabled={busy !== null || !ready} onClick={() => onResolve('keep', number(a), number(b))} className={buttonSecondary}>
                        {t('qKeep', { unit })}
                    </button>
                )}
                <AiButton busy={busy} id={`ai-u-${item.id}-${question.family}`} available={aiAvailable} onClick={onAi} />
            </div>
            {!question.keepable && <p className="mt-2 text-xs text-faint">{t('qNotEuropean', { unit })}</p>}
        </li>
    );
}

/** One card: its names in both languages, its units, its aisle — saved when changed. */
function ItemRow({
    item,
    locale,
    detail,
    selected,
    busy,
    onSelect,
    onSave,
    onMain,
    onUnits,
    onDelete,
}: {
    item: Item;
    locale: 'de' | 'en';
    detail: 'uses' | 'date';
    selected: boolean;
    busy: boolean;
    onSelect: () => void;
    onSave: (next: { de: string; en: string; aliases: string[]; aisle?: string | null }) => Promise<unknown>;
    onMain: (unit: string | null) => void;
    onUnits: (main: string, rows: { unit: string; a: number; b: number }[]) => void;
    onDelete: () => void;
}) {
    const t = useTranslations('Ingredients');
    const tShop = useTranslations('Shopping');
    const [open, setOpen] = useState(false);
    const [de, setDe] = useState(item.de);
    const [en, setEn] = useState(item.en);
    const [deAlso, setDeAlso] = useState(item.aliases.filter(isGermanName).join(', '));
    const [enAlso, setEnAlso] = useState(item.aliases.filter((alias) => !isGermanName(alias)).join(', '));
    const [saving, setSaving] = useState(false);
    const list = (text: string) =>
        text
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);
    const aliases = [...list(deAlso), ...list(enAlso)];
    const dirty = de !== item.de || en !== item.en || aliases.join('|') !== [...item.aliases.filter(isGermanName), ...item.aliases.filter((alias) => !isGermanName(alias))].join('|');
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
                    <span className="block truncate">
                        {first || <span className="text-danger">{t(locale === 'de' ? 'germanMissing' : 'englishMissing')}</span>}
                        {item.stock && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs text-muted">{t('stock')}</span>}
                    </span>
                    <span className="block truncate text-xs text-faint">
                        {second || <span className="text-danger">{t(locale === 'de' ? 'englishMissing' : 'germanMissing')}</span>}
                        {item.main !== null && ` · ${unitLabel(item.main, locale)}`}
                    </span>
                </span>
                <span className="shrink-0 text-xs text-faint">
                    {detail === 'date' ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(item.createdAt)) : t('usesShort', { count: item.uses })}
                </span>
                <span aria-hidden className={`shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`}>
                    ›
                </span>
            </button>
        </div>
    );
    if (!open) return <li className={selected ? 'bg-surface' : ''}>{head}</li>;

    return (
        <li className={`pb-4 ${selected ? 'bg-surface' : ''}`}>
            {head}
            <div className="flex flex-col gap-3 pl-11">
                {/* The two names, each with its further ones. */}
                <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-muted">
                        {t('german')}
                        <input value={de} onChange={(event) => setDe(event.target.value)} className={`${field} mt-1 text-base text-ink`} placeholder={t('missing')} />
                    </label>
                    <label className="text-xs text-muted">
                        {t('germanAlso')}
                        <input value={deAlso} onChange={(event) => setDeAlso(event.target.value)} className={`${field} mt-1 text-base text-ink`} placeholder={t('germanAlsoPlaceholder')} />
                    </label>
                    <label className="text-xs text-muted">
                        {t('english')}
                        <input value={en} onChange={(event) => setEn(event.target.value)} className={`${field} mt-1 text-base text-ink`} placeholder={t('missing')} />
                    </label>
                    <label className="text-xs text-muted">
                        {t('englishAlso')}
                        <input value={enAlso} onChange={(event) => setEnAlso(event.target.value)} className={`${field} mt-1 text-base text-ink`} placeholder={t('englishAlsoPlaceholder')} />
                    </label>
                </div>
                {dirty && (
                    <button
                        type="button"
                        disabled={saving || (!de.trim() && !en.trim())}
                        onClick={async () => {
                            setSaving(true);
                            await onSave({ de: de.trim(), en: en.trim(), aliases });
                            setSaving(false);
                        }}
                        className={`self-start ${buttonPrimarySmall}`}
                    >
                        <BusyLabel busy={saving}>{t('save')}</BusyLabel>
                    </button>
                )}

                <CardUnits item={item} locale={locale} busy={busy} onMain={onMain} onUnits={onUnits} />

                {/* Where it goes on the shopping list; beats every rule. */}
                <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {t('aisle')}
                    <select
                        value={item.aisle ?? ''}
                        onChange={(event) => void onSave({ de: item.de, en: item.en, aliases: item.aliases, aisle: event.target.value || null })}
                        className="min-h-9 rounded-lg border border-control bg-transparent px-2 text-sm text-ink"
                    >
                        <option value="">{t('aisleAuto', { aisle: tShop(`aisle.${item.ruleAisle}`) })}</option>
                        {CHOOSABLE_AISLES.map((aisle) => (
                            <option key={aisle} value={aisle}>
                                {tShop(`aisle.${aisle}`)}
                            </option>
                        ))}
                    </select>
                </label>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-xs text-faint">
                        {t('uses', { count: item.uses })}
                        {item.stock && ` · ${t('stockExplain')}`}
                    </span>
                    {item.uses === 0 && (
                        <button type="button" onClick={onDelete} className="ml-auto min-h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-danger">
                            {t('delete')}
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

/**
 * A card's units, one list: the main unit, then every further unit with its
 * conversion to the main one ("7 Stück = 1 Bund"). The main unit changes at
 * once (the old one stays as a further unit); the rows are saved together.
 */
function CardUnits({
    item,
    locale,
    busy,
    onMain,
    onUnits,
}: {
    item: Item;
    locale: 'de' | 'en';
    busy: boolean;
    onMain: (unit: string | null) => void;
    onUnits: (main: string, rows: { unit: string; a: number; b: number }[]) => void;
}) {
    const t = useTranslations('Ingredients');
    const choices = [...new Set([...UNIT_CHOICES, ...item.unitUses.map((use) => use.unit), ...item.units.map((row) => row.unit), ...(item.main !== null ? [item.main] : [])])];
    const initial = item.units.map((row) => ({ unit: row.unit, a: row.a === null ? '' : String(row.a), b: row.b === null ? '' : String(row.b).replace('.', ',') }));
    const [rows, setRows] = useState(initial);
    const number = (text: string) => Number(text.replace(',', '.'));
    const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
    const valid = rows.every((row) => number(row.a) > 0 && number(row.b) > 0);
    const select = 'min-h-9 rounded-lg border border-control bg-transparent px-2 text-sm text-ink';
    const field = 'w-16 rounded-lg border border-control bg-transparent px-2 py-1 text-base outline-none focus:border-ink';
    const main = item.main;
    return (
        <div className="text-sm">
            <p className="text-xs text-muted">{t('units')}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <select
                    value={main ?? ''}
                    onChange={(event) => onMain(event.target.value === '' && main === null ? null : event.target.value)}
                    disabled={busy}
                    aria-label={t('mainUnit')}
                    className={select}
                >
                    {main === null && <option value="">—</option>}
                    {choices.map((unit) => (
                        <option key={unit} value={unit}>
                            {unitLabel(unit, locale)}
                        </option>
                    ))}
                </select>
                <span className="text-xs text-muted">{item.mainChosen ? t('mainUnit') : t('mainUnitAuto')}</span>
            </div>
            {main !== null && (
                <ul className="mt-2 flex flex-col gap-2">
                    {rows.map((row, index) => (
                        <li key={index} className="flex flex-wrap items-center gap-2">
                            <input
                                value={row.a}
                                onChange={(event) => setRows((now) => now.map((other, at) => (at === index ? { ...other, a: event.target.value } : other)))}
                                inputMode="decimal"
                                aria-label={t('convA', { unit: unitLabel(row.unit, locale) })}
                                className={field}
                            />
                            <select
                                value={row.unit}
                                onChange={(event) => setRows((now) => now.map((other, at) => (at === index ? { ...other, unit: event.target.value } : other)))}
                                aria-label={t('furtherUnit')}
                                className={select}
                            >
                                {choices
                                    .filter((unit) => unit !== main)
                                    .map((unit) => (
                                        <option key={unit} value={unit}>
                                            {unitLabel(unit, locale)}
                                        </option>
                                    ))}
                            </select>
                            <span>=</span>
                            <input
                                value={row.b}
                                onChange={(event) => setRows((now) => now.map((other, at) => (at === index ? { ...other, b: event.target.value } : other)))}
                                inputMode="decimal"
                                placeholder="?"
                                aria-label={t('convB', { unit: unitLabel(main, locale) })}
                                className={field}
                            />
                            <span>{unitLabel(main, locale)}</span>
                            <button
                                type="button"
                                onClick={() => setRows((now) => now.filter((_, at) => at !== index))}
                                aria-label={t('removeUnit', { unit: unitLabel(row.unit, locale) })}
                                className="flex h-9 w-9 items-center justify-center text-faint hover:text-danger"
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {main !== null && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setRows((now) => [...now, { unit: choices.find((unit) => unit !== main && !now.some((row) => row.unit === unit)) ?? '', a: '1', b: '' }])}
                        className="min-h-9 rounded-full border border-control px-3 text-xs hover:border-ink"
                    >
                        {t('addUnit')}
                    </button>
                    {dirty && (
                        <button
                            type="button"
                            disabled={busy || !valid}
                            onClick={() =>
                                onUnits(
                                    main,
                                    rows.map((row) => ({ unit: row.unit, a: number(row.a), b: number(row.b) })),
                                )
                            }
                            className={buttonPrimarySmall}
                        >
                            {t('save')}
                        </button>
                    )}
                    {dirty && !valid && <span className="text-xs text-faint">{t('convMissing')}</span>}
                </div>
            )}
        </div>
    );
}
