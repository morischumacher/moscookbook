'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AISLES, amountLabel, listAsText, type Aisle } from '@/lib/shopping';
import type { ShoppingItemRow } from '@/lib/shoppingDb';
import { useConfirm } from '@/components/ui/useConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * The list, in the shop.
 *
 * Built for one hand and bad signal: big boxes to tick, the list in the order
 * the shop is walked, what is in the trolley moved out of the way. A tick
 * shows at once and is sent in the background; with no signal it is kept on
 * the phone and sent when the signal comes back, so the list never argues
 * with the person holding it.
 *
 * The same component serves the owner (at /shopping) and whoever was sent the
 * link (at /s/<token>), who can tick and add but not delete or share.
 */

type Mode = { kind: 'own'; shareToken: string | null } | { kind: 'shared'; token: string };

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

    const [items, setItems] = useState(initial);
    const [text, setText] = useState('');
    const [adding, setAdding] = useState(false);
    const [shareToken, setShareToken] = useState(mode.kind === 'own' ? mode.shareToken : null);
    const [note, setNote] = useState('');

    const base = mode.kind === 'own' ? '/api/shopping' : `/api/shopping/shared/${mode.token}`;

    /** Sends one tick. Returns false when it could not be sent. */
    const sendTick = useCallback(
        async (id: number, checked: boolean) => {
            try {
                const res =
                    mode.kind === 'own'
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
                // A 404 is an item somebody else removed: nothing left to send.
                return res.ok || res.status === 404;
            } catch {
                return false;
            }
        },
        [base, mode.kind]
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
            if (!res.ok) return;
            const data: { items: ShoppingItemRow[] } = await res.json();
            const pending = readPending(base);
            setItems(data.items.map((item) => (item.id in pending ? { ...item, checked: pending[item.id] } : item)));
        } catch {
            // Offline: what is on screen is the best there is.
        }
    }, [base, flush]);

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
        setItems((current) => current.filter((item) => item.id !== id));
        await fetch(`/api/shopping/${id}`, { method: 'DELETE' }).catch(() => undefined);
    };

    const clear = async (which: 'checked' | 'all') => {
        if (which === 'all' && !(await ask({ title: t('clearAllQuestion'), confirmLabel: t('clearAll'), destructive: true }))) return;
        const res = await fetch(`/api/shopping?which=${which}`, { method: 'DELETE' }).catch(() => null);
        if (res?.ok) setItems(((await res.json()) as { items: ShoppingItemRow[] }).items);
    };

    // The address is only known in the browser. Read after hydration, so the
    // server's HTML and the first client render agree.
    const [origin, setOrigin] = useState('');
    useEffect(() => setOrigin(window.location.origin), []);
    const shareLink = shareToken && origin ? `${origin}/${locale}/s/${shareToken}` : null;

    const toggleShare = async () => {
        const res = await fetch('/api/shopping/share', { method: shareToken ? 'DELETE' : 'POST' }).catch(() => null);
        if (res?.ok) setShareToken(((await res.json()) as { shareToken: string | null }).shareToken);
    };

    const aisleName = useCallback((aisle: Aisle) => t(`aisle.${aisle}`), [t]);
    const asText = useMemo(() => listAsText(items, aisleName, locale), [items, aisleName, locale]);

    const sendText = async () => {
        const body = `${t('title')}\n\n${asText}${shareLink ? `\n\n${shareLink}` : ''}`;
        try {
            if (navigator.share) await navigator.share({ title: t('title'), text: body });
            else {
                await navigator.clipboard.writeText(body);
                setNote(t('copied'));
            }
        } catch {
            // Cancelled from the share sheet: nothing to say.
        }
    };

    const open = items.filter((item) => !item.checked);
    const done = items.filter((item) => item.checked);

    const line = (item: ShoppingItemRow) => {
        const amount = amountLabel(item.measure, item.amount, locale);
        return (
            <li key={item.id} className="flex items-start gap-3 py-2">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.checked}
                    onClick={() => void toggle(item.id, !item.checked)}
                    aria-label={t(item.checked ? 'untick' : 'tick', { name: item.name })}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg transition-colors ${
                        item.checked ? 'border-transparent bg-ink text-page' : 'border-control'
                    }`}
                >
                    {item.checked ? '✓' : ''}
                </button>
                <div className={`min-w-0 flex-1 pt-2 ${item.checked ? 'text-faint line-through' : ''}`}>
                    <p className="leading-snug">
                        {amount && <span className="font-semibold">{amount} </span>}
                        {item.name}
                    </p>
                    {item.sources.length > 0 && !item.checked && (
                        <p className="mt-0.5 text-xs text-faint">{t('for', { recipes: item.sources.join(', ') })}</p>
                    )}
                </div>
                {mode.kind === 'own' && (
                    <button
                        type="button"
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

    return (
        <div>
            {dialog}

            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void add();
                }}
                className="flex gap-2"
            >
                <label htmlFor="shopping-add" className="sr-only">{t('addLabel')}</label>
                <input
                    id="shopping-add"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={t('addPlaceholder')}
                    className="min-w-0 flex-1 rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                />
                <button type="submit" disabled={adding || !text.trim()} className={buttonPrimarySmall}>
                    <BusyLabel busy={adding}>{t('add')}</BusyLabel>
                </button>
            </form>

            {/* Always there, empty until something is said: a status region
                that appears together with its text is often not read out. */}
            <p role="status" className={note ? 'mt-3 text-sm text-muted' : 'sr-only'}>
                {note}
            </p>

            {items.length === 0 ? (
                <div className="py-16 text-center text-muted">
                    <p>{t('empty')}</p>
                    {mode.kind === 'own' && (
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
                    {AISLES.map((aisle) => {
                        const here = open.filter((item) => item.aisle === aisle);
                        if (here.length === 0) return null;
                        return (
                            <section key={aisle} className="mt-8">
                                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">{aisleName(aisle)}</h2>
                                <ul className="divide-y divide-line">{here.map(line)}</ul>
                            </section>
                        );
                    })}

                    {open.length === 0 && <p className="mt-10 text-center text-muted">{t('allDone')}</p>}

                    {done.length > 0 && (
                        <section className="mt-10 border-t border-line pt-4">
                            <div className="flex items-baseline justify-between gap-4">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-faint">
                                    {t('inTrolley', { count: done.length })}
                                </h2>
                                {mode.kind === 'own' && (
                                    <button type="button" onClick={() => void clear('checked')} className="text-sm text-muted underline underline-offset-4">
                                        {t('clearChecked')}
                                    </button>
                                )}
                            </div>
                            <ul className="divide-y divide-line">{done.map(line)}</ul>
                        </section>
                    )}
                </>
            )}

            <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-sm">
                {items.length > 0 && (
                    <button type="button" onClick={() => void sendText()} className="self-start underline underline-offset-4">
                        {t('sendAsText')}
                    </button>
                )}

                {mode.kind === 'own' && (
                    <div className="rounded-xl border border-line p-4">
                        <p className="font-medium">{t('shareTitle')}</p>
                        <p className="mt-1 text-muted">{t('shareExplain')}</p>
                        {shareLink && (
                            <p className="mt-3 break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs">{shareLink}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-4">
                            {shareLink && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (navigator.share) void navigator.share({ title: t('title'), url: shareLink }).catch(() => undefined);
                                        else void navigator.clipboard.writeText(shareLink).then(() => setNote(t('copied')));
                                    }}
                                    className="font-medium underline underline-offset-4"
                                >
                                    {t('sendLink')}
                                </button>
                            )}
                            <button type="button" onClick={() => void toggleShare()} className="text-muted underline underline-offset-4">
                                {shareLink ? t('unshare') : t('share')}
                            </button>
                        </div>
                    </div>
                )}

                {mode.kind === 'own' && items.length > 0 && (
                    <button type="button" onClick={() => void clear('all')} className="self-start text-faint underline underline-offset-4 hover:text-danger">
                        {t('clearAll')}
                    </button>
                )}
            </div>
        </div>
    );
}
