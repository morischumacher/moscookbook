'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { AISLES, amountLabel, listAsText, type Aisle } from '@/lib/shopping';
import { displayName, itemName } from '@/lib/ingredientNames';
import type { ShoppingItemRow } from '@/lib/shoppingDb';
import { partsOf } from '@/lib/shoppingParts';
import { useConfirm } from '@/components/ui/useConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';
import Sheet, { sheetItem } from '@/components/ui/Sheet';
import Avatar from '@/components/Avatar';
import ShoppingSharing from './ShoppingSharing';
import ListSettings from './ListSettings';
import AddRecipeSearch from './AddRecipeSearch';

/**
 * The list, in the shop.
 *
 * Built for one hand and bad signal: big boxes to tick, the list in the order
 * the shop is walked. A ticked line stays where it is, struck through — it
 * jumping to a "trolley" section further down made the list shift under the
 * thumb and showed everything twice. Everything that is not shopping (who is
 * on the list, the link, the recipes, renaming, emptying) is in one menu
 * behind "…" rather than stacked under the list. A tick
 * shows at once and is sent in the background; with no signal it is kept on
 * the phone and sent when the signal comes back, so the list never argues
 * with the person holding it.
 *
 * The same component serves everybody shopping on the list with an account
 * (at /shopping — the owner and whoever joined it, who can do everything but
 * choose who else is on it), and whoever was sent the link (at /s/<token>),
 * who can look — and tick and add, if they are signed in and the owner allows it.
 *
 * When more than one person is on a list, each line can say who is buying
 * it, and the list can be narrowed to one person's share of the shop.
 */

interface Person {
    id: number;
    name: string;
    avatarUrl?: string | null;
    /** Invited and not yet answered: can be given lines already. */
    invited?: boolean;
}

type Mode =
    | {
          kind: 'account';
          listId: number;
          name: string | null;
          owner: boolean;
          shareToken: string | null;
          canAdd: boolean;
          /** Everybody on the list, owner first, then those invited. */
          people: Person[];
          me: number;
          /** Combining units is the admin's: it may ask the AI, which costs. */
          admin: boolean;
          /** For somebody who joined: whose list it is. */
          ownerName: string;
      }
    | { kind: 'shared'; token: string; canAdd: boolean; signedIn: boolean };

/*
 * One store per list: ticks queued on your own list are not sent to somebody
 * else's shared one (where each was a 404, and then thrown away).
 */
const pendingKey = (base: string) => `shopping-pending:${base}`;

function readPending(base: string): Record<number, boolean> {
    try {
        return JSON.parse(localStorage.getItem(pendingKey(base)) ?? '{}') as Record<number, boolean>;
    } catch {
        return {};
    }
}

function writePending(base: string, pending: Record<number, boolean>) {
    try {
        localStorage.setItem(pendingKey(base), JSON.stringify(pending));
    } catch {
        // A full or blocked store: the tick is still on screen and in memory.
    }
}

export default function ShoppingListView({ initial, mode }: { initial: ShoppingItemRow[]; mode: Mode }) {
    const t = useTranslations('Shopping');
    const locale = useLocale() as 'en' | 'de';
    const [ask, dialog] = useConfirm();
    const router = useRouter();

    const [items, setItems] = useState(initial);
    const [text, setText] = useState('');
    const [adding, setAdding] = useState(false);
    const [note, setNote] = useState('');
    // Whether the link may change the list. It can change while somebody has it open.
    const [linkCanAdd, setLinkCanAdd] = useState(mode.kind === 'shared' ? mode.canAdd : true);
    const canEdit = mode.kind !== 'shared' || linkCanAdd;

    // Which list, on every call about it.
    const listQuery = mode.kind === 'account' ? `list=${mode.listId}` : '';
    const base = mode.kind === 'shared' ? `/api/shopping/shared/${mode.token}` : `/api/shopping?${listQuery}`;
    // The add field is folded away: most lines come from recipes.
    const [adderOpen, setAdderOpen] = useState(false);
    // The menu, and what was chosen from it.
    const [sheet, setSheet] = useState<null | 'menu' | 'share' | 'recipes' | 'rename'>(null);

    const people = useMemo(() => (mode.kind === 'account' ? mode.people : []), [mode]);
    // Splitting the shop only means something with somebody to split it with.
    const together = people.length > 1;
    const personOf = useCallback((id: number | null) => people.find((person) => person.id === id) ?? null, [people]);
    const [who, setWho] = useState<'all' | 'nobody' | number>('all');

    /** Sends one tick. Returns false when it could not be sent. */
    const sendTick = useCallback(
        async (id: number, checked: boolean) => {
            try {
                const res =
                    mode.kind !== 'shared'
                        ? await fetch(`/api/shopping/${id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ checked }),
                          })
                        : await fetch(base, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ itemId: id, checked }),
                          });
                // A 404 is an item somebody else removed, a 403 a link that may
                // no longer tick: nothing left to send either way.
                return res.ok || res.status === 404 || res.status === 403;
            } catch {
                return false;
            }
        },
        [base, mode.kind],
    );

    /** Whatever was ticked without signal, sent now. */
    const flush = useCallback(async () => {
        const pending = readPending(base);
        for (const [id, checked] of Object.entries(pending)) {
            if (await sendTick(Number(id), checked)) delete pending[Number(id)];
        }
        writePending(base, pending);
    }, [base, sendTick]);

    const refresh = useCallback(async () => {
        await flush();
        try {
            const res = await fetch(base);
            // Taken off this list, or it was deleted, while the page was open.
            if (res.status === 404 && mode.kind === 'account') {
                router.replace('/shopping');
                router.refresh();
                return;
            }
            if (!res.ok) return;
            const data: { items: ShoppingItemRow[]; canAdd?: boolean } = await res.json();
            if (typeof data.canAdd === 'boolean') setLinkCanAdd(data.canAdd);
            const pending = readPending(base);
            setItems(data.items.map((item) => (item.id in pending ? { ...item, checked: pending[item.id] } : item)));
        } catch {
            // Offline: what is on screen is the best there is.
        }
    }, [base, flush, mode.kind, router]);

    // Ticks made offline on an earlier visit, and anything the other person
    // ticked meanwhile: on arrival, when the phone comes back online, and when
    // the page is looked at again.
    useEffect(() => {
        const pending = readPending(base);
        if (Object.keys(pending).length > 0) {
            setItems((current) => current.map((item) => (item.id in pending ? { ...item, checked: pending[item.id] } : item)));
        }
        void refresh();
        const onFocus = () => document.visibilityState === 'visible' && void refresh();
        window.addEventListener('online', refresh);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('online', refresh);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [base, refresh]);

    /*
     * A removed line goes, and the button that had the focus goes with it:
     * the focus fell to the top of the page. When the focus was on that
     * line, it moves to the line that took its place.
     */
    const keepFocusAfter = (id: number) => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || active.dataset.line !== String(id)) return;
        const order = [...document.querySelectorAll<HTMLElement>('[data-line][role="checkbox"]')].map((element) => element.dataset.line);
        const at = order.indexOf(String(id));
        const next = order[at + 1] ?? order[at - 1];
        requestAnimationFrame(() => {
            const target = next === undefined ? null : document.querySelector<HTMLElement>(`[data-line="${next}"][role="checkbox"]`);
            target?.focus({ preventScroll: false });
        });
    };

    const toggle = async (id: number, checked: boolean) => {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, checked } : item)));
        const pending = readPending(base);
        if (await sendTick(id, checked)) {
            // A newer tick that got through replaces one still queued from
            // offline, which would otherwise be sent later and undo it.
            if (id in pending) {
                delete pending[id];
                writePending(base, pending);
            }
        } else {
            writePending(base, { ...pending, [id]: checked });
            setNote(t('offlineNote'));
        }
    };

    const assign = async (item: ShoppingItemRow, buyerId: number | null) => {
        const before = item.buyerId;
        setItems((current) => current.map((line) => (line.id === item.id ? { ...line, buyerId } : line)));
        const res = await fetch(`/api/shopping/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buyerId }),
        }).catch(() => null);
        if (!res?.ok) {
            setItems((current) => current.map((line) => (line.id === item.id ? { ...line, buyerId: before } : line)));
            setNote(t('failed'));
        }
    };

    const add = async () => {
        if (!text.trim()) return;
        setAdding(true);
        try {
            const res = await fetch(base, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (res.ok) {
                const data: { items: ShoppingItemRow[] } = await res.json();
                setItems(data.items);
                setText('');
            } else if (res.status === 403 && mode.kind === 'shared') {
                setLinkCanAdd(false);
                setNote(t('linkViewOnly'));
            } else {
                setNote(t('failed'));
            }
        } catch {
            setNote(t('failed'));
        } finally {
            setAdding(false);
        }
    };

    const remove = async (id: number) => {
        keepFocusAfter(id);
        setItems((current) => current.filter((item) => item.id !== id));
        await fetch(`/api/shopping/${id}`, { method: 'DELETE' }).catch(() => undefined);
    };

    const clear = async (which: 'checked' | 'all') => {
        setSheet(null);
        if (
            which === 'all' &&
            !(await ask({
                title: t('clearAllQuestion'),
                confirmLabel: t('clearAll'),
                destructive: true,
            }))
        )
            return;
        const res = await fetch(`/api/shopping?which=${which}&${listQuery}`, { method: 'DELETE' }).catch(() => null);
        if (res?.ok) setItems(((await res.json()) as { items: ShoppingItemRow[] }).items);
        else setNote(t('failed'));
    };

    // The address is only known in the browser. Read after hydration, so the
    // server's HTML and the first client render agree.
    const [shareToken, setShareToken] = useState(mode.kind === 'account' ? mode.shareToken : null);
    const [origin, setOrigin] = useState('');
    useEffect(() => setOrigin(window.location.origin), []);
    const shareLink = shareToken && origin ? `${origin}/${locale}/s/${shareToken}` : null;

    /** Everything one recipe put on the list, taken off again. */
    const removeRecipe = async (source: string) => {
        if (!(await ask({ title: t('removeRecipeQuestion', { recipe: source }), confirmLabel: t('removeRecipe'), destructive: true }))) return;
        const res = await fetch(`/api/shopping/remove?${listQuery}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source }),
        }).catch(() => null);
        if (res?.ok) setItems(((await res.json()) as { items: ShoppingItemRow[] }).items);
        else setNote(t('failed'));
    };

    /**
     * One ingredient in several units — "14 Frühlingszwiebeln" and "2 Bund" —
     * made one line in the unit it is bought in. How much is for which recipe
     * goes along, so taking a recipe off later still takes off just its share.
     */
    const [simplifying, setSimplifying] = useState(false);
    const simplify = async () => {
        setSheet(null);
        setSimplifying(true);
        const res = await fetch(`/api/shopping/simplify?${listQuery}`, { method: 'POST' }).catch(() => null);
        setSimplifying(false);
        if (!res?.ok) return setNote(t('failed'));
        const answer = (await res.json()) as { items: ShoppingItemRow[]; merged: number; unresolved: string[] };
        setItems(answer.items);
        setNote(answer.unresolved.length > 0 ? t('simplifyOpen', { names: answer.unresolved.join(', ') }) : t('simplified', { count: answer.merged }));
    };

    const leave = async () => {
        setSheet(null);
        if (mode.kind !== 'account' || !(await ask({ title: t('leaveQuestion'), confirmLabel: t('leave') }))) return;
        const res = await fetch(`/api/shopping/members?list=${mode.listId}&leave=1`, { method: 'DELETE' }).catch(() => null);
        if (res?.ok) {
            router.replace('/shopping');
            router.refresh();
        } else setNote(t('failed'));
    };

    const deleteList = async () => {
        setSheet(null);
        if (mode.kind !== 'account' || mode.name === null) return;
        if (!(await ask({ title: t('deleteListQuestion', { name: mode.name }), confirmLabel: t('deleteList'), destructive: true }))) return;
        const res = await fetch(`/api/shopping/lists?list=${mode.listId}`, { method: 'DELETE' }).catch(() => null);
        if (res?.ok) {
            router.replace('/shopping');
            router.refresh();
        } else setNote(t('failed'));
    };

    const aisleName = useCallback((aisle: Aisle) => t(`aisle.${aisle}`), [t]);
    const asText = useMemo(() => listAsText(items, aisleName, locale), [items, aisleName, locale]);

    const sendText = async () => {
        setSheet(null);
        // A named list goes out under its name: "Grillparty", not "Einkaufsliste".
        const heading = (mode.kind === 'account' && mode.name) || t('title');
        const body = `${heading}\n\n${asText}${shareLink ? `\n\n${shareLink}` : ''}`;
        try {
            if (navigator.share) await navigator.share({ title: heading, text: body });
            else {
                await navigator.clipboard.writeText(body);
                setNote(t('copied'));
            }
        } catch {
            // Cancelled from the share sheet: nothing to say.
        }
    };

    const [search, setSearch] = useState('');

    const shown = (item: ShoppingItemRow) => {
        if (who === 'nobody' && item.buyerId !== null) return false;
        if (typeof who === 'number' && item.buyerId !== who) return false;
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return ((item.item && itemName(item.item, locale, item.amount, item.measure)) || displayName(item.name, locale, item.amount, item.measure)).toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || aisleName(item.aisle as Aisle).toLowerCase().includes(q) || item.sources.some((s) => s.toLowerCase().includes(q));
    };

    const open = items.filter((item) => !item.checked);
    const checked = items.filter((item) => item.checked);
    // The ingredients that are on the list in more than one unit.
    const severalUnits = useMemo(() => {
        if (mode.kind !== 'account' || !mode.admin) return [];
        const measures = new Map<string, { item: ShoppingItemRow; units: Set<string> }>();
        for (const item of items) {
            if (item.checked || item.itemId === null || item.measure === null) continue;
            // An optional line is apart from the one that is needed (lib/shopping).
            const id = `${item.itemId}:${item.aisle === 'optional'}`;
            const group = measures.get(id) ?? { item, units: new Set<string>() };
            group.units.add(item.measure);
            measures.set(id, group);
        }
        return [...measures.values()].filter((group) => group.units.size > 1).map(({ item }) => (item.item && itemName(item.item, locale, null, null)) || displayName(item.name, locale, null, null));
    }, [items, locale, mode]);
    const visible = items.filter(shown);

    /** "Agedashi Tofu (1 Bund), Chili-Öl (½ Bund)" — each recipe's share, when there are several and they are known. */
    const forWhom = (item: ShoppingItemRow) => {
        const parts = partsOf(item).filter((part) => part.s !== null);
        if (item.sources.length < 2 || parts.some((part) => part.a === null)) return item.sources.join(', ');
        return item.sources.map((source) => {
            const share = parts.filter((part) => part.s === source).reduce((sum, part) => sum + (part.a ?? 0), 0);
            const label = share > 0 ? amountLabel(item.measure, share, locale) : '';
            return label ? `${source} (${label})` : source;
        }).join(', ');
    };

    const line = (item: ShoppingItemRow) => {
        const amount = amountLabel(item.measure, item.amount, locale);
        // "Frühlingszwiebeln" on the German page, "spring onions" on the English one.
        const name = (item.item && itemName(item.item, locale, item.amount, item.measure)) || displayName(item.name, locale, item.amount, item.measure);
        const buyerPerson = personOf(item.buyerId);
        const buyer = buyerPerson ? (mode.kind === 'account' && buyerPerson.id === mode.me ? t('me') : buyerPerson.name) : null;

        return (
            <li key={item.id} className="flex items-start gap-3 py-2">
                {canEdit ? (
                    <button
                        type="button"
                        role="checkbox"
                        data-line={item.id}
                        aria-checked={item.checked}
                        onClick={() => void toggle(item.id, !item.checked)}
                        aria-label={t(item.checked ? 'untick' : 'tick', { name: item.name })}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg transition-colors ${
                            item.checked ? 'border-transparent bg-ink text-page' : 'border-control'
                        }`}
                    >
                        {item.checked ? '✓' : ''}
                    </button>
                ) : (
                    <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg ${item.checked ? 'border-transparent bg-faint text-page' : 'border-control'}`}
                        aria-label={item.checked ? t('isTicked') : undefined}
                    >
                        {item.checked ? '✓' : ''}
                    </span>
                )}
                <div className="min-w-0 flex-1 pt-2">
                    <p className={`leading-snug ${item.checked ? 'text-faint line-through' : ''}`}>
                        {amount && <span className="font-semibold">{amount} </span>}
                        {name}
                    </p>
                    {(item.sources.length > 0 || (together && (buyer || !item.checked))) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                            {item.sources.length > 0 && !item.checked && <span>{t('for', { recipes: forWhom(item) })}</span>}
                            {together &&
                                (item.checked ? (
                                    buyerPerson && (
                                        <span className="inline-flex items-center gap-1.5">
                                            <Avatar name={buyerPerson.name} url={buyerPerson.avatarUrl ?? null} size={18} />
                                            {t('boughtBy', { name: buyer ?? '' })}
                                        </span>
                                    )
                                ) : (
                                    // A native picker: on a phone it opens the system's own list.
                                    <label
                                        className={`relative inline-flex min-h-8 items-center gap-1.5 rounded-full py-0.5 ${
                                            buyerPerson ? 'bg-surface pl-0.5 pr-2.5 font-semibold text-ink' : 'border border-line px-2.5 text-muted hover:border-ink hover:text-ink'
                                        }`}
                                    >
                                        {buyerPerson && <Avatar name={buyerPerson.name} url={buyerPerson.avatarUrl ?? null} size={22} />}
                                        <span aria-hidden>{buyer ?? t('whoBuys')}</span>
                                        <select
                                            value={item.buyerId ?? ''}
                                            onChange={(event) => void assign(item, event.target.value ? Number(event.target.value) : null)}
                                            aria-label={t('whoBuysFor', { name: item.name })}
                                            className="absolute inset-0 cursor-pointer opacity-0"
                                        >
                                            <option value="">{t('nobody')}</option>
                                            {people.map((person) => (
                                                <option key={person.id} value={person.id}>
                                                    {mode.kind === 'account' && person.id === mode.me ? t('me') : person.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                        </div>
                    )}
                </div>
                {mode.kind !== 'shared' && (
                    <button
                        type="button"
                        data-line={item.id}
                        onClick={() => void remove(item.id)}
                        aria-label={t('remove', { name: item.name })}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface hover:text-danger"
                    >
                        ×
                    </button>
                )}
            </li>
        );
    };

    // The recipes on the list, in the order they first appear, for taking one off whole.
    const recipes = [...new Set(items.flatMap((item) => item.sources))];

    const adder = canEdit && (
        <div className="mt-6">
            {adderOpen ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void add();
                    }}
                    className="flex gap-2"
                >
                    <label htmlFor="shopping-add" className="sr-only">
                        {t('addLabel')}
                    </label>
                    <input
                        id="shopping-add"
                        // Opened by a tap on "add": the field is what was asked for.
                        autoFocus
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={t('addPlaceholder')}
                        className="min-w-0 flex-1 rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                    />
                    <button type="submit" disabled={adding || !text.trim()} className={buttonPrimarySmall}>
                        <BusyLabel busy={adding}>{t('add')}</BusyLabel>
                    </button>
                </form>
            ) : (
                <button type="button" onClick={() => setAdderOpen(true)} className="min-h-11 text-sm font-medium underline underline-offset-4">
                    {t('addSomething')}
                </button>
            )}
        </div>
    );

    const filterChip = (active: boolean) =>
        `inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
            active ? 'border-ink bg-ink text-page' : 'border-control text-muted hover:border-ink hover:text-ink'
        }`;
    const countFor = (match: (item: ShoppingItemRow) => boolean) => open.filter(match).length;

    const others = people.filter((person) => !person.invited && mode.kind === 'account' && person.id !== mode.me).map((person) => person.name);

    return (
        <div>
            {dialog}

            {mode.kind === 'shared' && !canEdit && (
                <p className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                    {mode.signedIn ? (
                        t('linkViewOnly')
                    ) : (
                        <>
                            {t('linkSignIn')}{' '}
                            <Link href={`/login?next=${encodeURIComponent(`/${locale}/s/${mode.token}`)}`} className="font-medium text-ink underline underline-offset-4">
                                {t('signIn')}
                            </Link>
                        </>
                    )}
                </p>
            )}

            {/* Always there, empty until something is said: a status region
                that appears together with its text is often not read out. */}
            <p role="status" className={note ? 'mb-3 text-sm text-muted' : 'sr-only'}>
                {note}
            </p>

            <div className="flex items-center gap-2">
                {items.length > 0 && (
                    <>
                        <label htmlFor="shopping-search" className="sr-only">
                            {t('searchLabel')}
                        </label>
                        <input
                            id="shopping-search"
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('searchPlaceholder')}
                            className="min-w-0 flex-1 rounded-full border border-control bg-transparent px-4 py-2 text-sm outline-none placeholder:text-faint focus:border-ink"
                        />
                    </>
                )}
                {mode.kind === 'account' && (
                    <button
                        type="button"
                        onClick={() => setSheet('menu')}
                        aria-label={t('menu')}
                        aria-haspopup="dialog"
                        className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-control text-xl leading-none hover:border-ink"
                    >
                        …
                    </button>
                )}
            </div>

            {together && items.length > 0 && (
                <div role="group" aria-label={t('filterLabel')} className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
                    <button type="button" aria-pressed={who === 'all'} onClick={() => setWho('all')} className={filterChip(who === 'all')}>
                        {t('filterAll')}
                    </button>
                    {people.map((person) => (
                        <button key={person.id} type="button" aria-pressed={who === person.id} onClick={() => setWho(person.id)} className={`${filterChip(who === person.id)} pl-1`}>
                            <Avatar name={person.name} url={person.avatarUrl ?? null} size={26} />
                            {mode.kind === 'account' && person.id === mode.me ? t('me') : person.name}
                            <span className="text-xs opacity-70">{countFor((item) => item.buyerId === person.id)}</span>
                        </button>
                    ))}
                    <button type="button" aria-pressed={who === 'nobody'} onClick={() => setWho('nobody')} className={filterChip(who === 'nobody')}>
                        {t('filterNobody')}
                        <span className="text-xs opacity-70">{countFor((item) => item.buyerId === null)}</span>
                    </button>
                </div>
            )}

            {items.length === 0 ? (
                <div className="py-12 text-center text-muted">
                    <p>{t('empty')}</p>
                    {mode.kind !== 'shared' && (
                        <p className="mt-2 text-sm">
                            {t('emptyHint')}{' '}
                            <Link href="/" className="underline underline-offset-4">
                                {t('toRecipes')}
                            </Link>
                        </p>
                    )}
                </div>
            ) : (
                <>
                    {mode.kind === 'account' && severalUnits.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface px-4 py-3 text-sm">
                            <p className="min-w-0 flex-1">{t('severalUnits', { names: severalUnits.join(', ') })}</p>
                            <button type="button" onClick={() => void simplify()} disabled={simplifying} className={buttonPrimarySmall}>
                                <BusyLabel busy={simplifying}>{t('simplify')}</BusyLabel>
                            </button>
                        </div>
                    )}
                    {AISLES.map((aisle) => {
                        const here = visible.filter((item) => item.aisle === aisle);
                        if (here.length === 0) return null;
                        return (
                            <section key={aisle} className="mt-6">
                                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">{aisleName(aisle)}</h2>
                                <ul className="divide-y divide-line">{here.map(line)}</ul>
                            </section>
                        );
                    })}

                    {visible.length === 0 && <p className="mt-10 text-center text-muted">{t('nothingMatches')}</p>}

                    {open.length === 0 && (
                        <div className="mt-10 flex flex-col items-center gap-3 text-center text-muted">
                            <p>{t('allDone')}</p>
                            {mode.kind === 'account' && (
                                <button type="button" onClick={() => void clear('checked')} className={buttonSecondary}>
                                    {t('clearCheckedCount', { count: checked.length })}
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {adder}

            {mode.kind === 'account' && sheet === 'menu' && (
                <Sheet title={mode.name ?? t('title')} onClose={() => setSheet(null)}>
                    <ul className="flex flex-col">
                        {mode.owner ? (
                            <li>
                                <button type="button" onClick={() => setSheet('share')} className={sheetItem}>
                                    <span>
                                        {t('menuShare')}
                                        <span className="block text-sm font-normal text-muted">
                                            {others.length > 0 ? t('sharedWith', { names: others.join(', ') }) : shareToken ? t('linkActive') : t('menuShareNone')}
                                        </span>
                                    </span>
                                    <span aria-hidden className="text-faint">›</span>
                                </button>
                            </li>
                        ) : (
                            <li className="px-3 pb-2 text-sm text-muted">{t('memberExplain', { name: mode.ownerName, names: people.filter((p) => !p.invited).map((p) => p.name).join(', ') })}</li>
                        )}
                        <li>
                            <button type="button" onClick={() => setSheet('recipes')} className={sheetItem}>
                                <span>{t('recipesOnListCount', { count: recipes.length })}</span>
                                <span aria-hidden className="text-faint">›</span>
                            </button>
                        </li>
                        {severalUnits.length > 0 && (
                            <li>
                                <button type="button" onClick={() => void simplify()} className={sheetItem}>
                                    {t('simplify')}
                                </button>
                            </li>
                        )}
                        {open.length > 0 && (
                            <li>
                                <button type="button" onClick={() => void sendText()} className={sheetItem}>
                                    {t('sendAsText')}
                                </button>
                            </li>
                        )}
                        {checked.length > 0 && (
                            <li>
                                <button type="button" onClick={() => void clear('checked')} className={sheetItem}>
                                    {t('clearCheckedCount', { count: checked.length })}
                                </button>
                            </li>
                        )}
                        {mode.owner && mode.name !== null && (
                            <li>
                                <button type="button" onClick={() => setSheet('rename')} className={sheetItem}>
                                    {t('renameList')}
                                </button>
                            </li>
                        )}
                        <li className="mt-2 border-t border-line pt-2" />
                        {items.length > 0 && (
                            <li>
                                <button type="button" onClick={() => void clear('all')} className={`${sheetItem} text-danger`}>
                                    {t('clearAll')}
                                </button>
                            </li>
                        )}
                        {mode.owner && mode.name !== null && (
                            <li>
                                <button type="button" onClick={() => void deleteList()} className={`${sheetItem} text-danger`}>
                                    {t('deleteList')}
                                </button>
                            </li>
                        )}
                        {!mode.owner && (
                            <li>
                                <button type="button" onClick={() => void leave()} className={`${sheetItem} text-danger`}>
                                    {t('leave')}
                                </button>
                            </li>
                        )}
                    </ul>
                </Sheet>
            )}

            {mode.kind === 'account' && sheet === 'share' && (
                <Sheet title={t('shareTitle')} onClose={() => setSheet(null)}>
                    <ShoppingSharing
                        listId={mode.listId}
                        shareLink={shareLink}
                        onShareToken={setShareToken}
                        canAdd={mode.canAdd}
                        onNote={setNote}
                        onChanged={() => router.refresh()}
                    />
                </Sheet>
            )}

            {mode.kind === 'account' && sheet === 'recipes' && (
                <Sheet title={t('recipesOnList')} onClose={() => setSheet(null)}>
                    {recipes.length === 0 ? (
                        <p className="text-muted">{t('noRecipesYet')}</p>
                    ) : (
                        <ul className="divide-y divide-line">
                            {recipes.map((recipe) => (
                                <li key={recipe} className="flex min-h-12 items-center justify-between gap-3">
                                    <span className="min-w-0">{recipe}</span>
                                    <button type="button" onClick={() => void removeRecipe(recipe)} className={buttonSecondary}>
                                        {t('removeRecipe')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <AddRecipeSearch
                        listId={mode.listId}
                        onAdded={(next, title) => {
                            setItems(next);
                            setNote(t('recipeAdded', { recipe: title }));
                        }}
                    />
                </Sheet>
            )}

            {mode.kind === 'account' && sheet === 'rename' && mode.name !== null && (
                <Sheet title={t('renameList')} onClose={() => setSheet(null)}>
                    <ListSettings listId={mode.listId} name={mode.name} onDone={() => setSheet(null)} />
                </Sheet>
            )}
        </div>
    );
}
