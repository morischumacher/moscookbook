'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/formatDate';
import Loading from '@/components/ui/Loading';
import { useConfirm } from '@/components/ui/useConfirm';
import { buttonPrimary, buttonSecondary } from '@/lib/ui';
import { Link } from '@/i18n/routing';
import { CardActions, DoneFold, ItemCard, KindBadge, NextStep, SectionHeading, SelectionBar, SelectToggle, useSelection } from './ReportSections';

interface Item {
    id: number;
    kind: 'capture' | 'error' | 'ticket';
    note: string | null;
    title: string;
    createdAt: string;
    closedAt: string | null;
    closedReason: string | null;
    auto: boolean;
    dismissed: boolean;
    doneAt: string | null;
    doneNote: string | null;
    doneRef: string | null;
}


/**
 * The AI's list, from the admin's side, in the order it asks things of you:
 *
 * 1. **Awaiting your confirmation** — the AI says it is done; only you can
 *    close it. Big Confirm / Send back.
 * 2. **With the AI** — nothing to do; each card says so, with "Mark done" and
 *    "Take back" (back to Tickets or Errors) for when you change your mind.
 * 3. **Done** — folded away; select and delete to tidy up.
 *
 * Withdrawn tasks are not listed: taking one back returns it to its ticket or
 * error list, which is where it is decided on from then on. The link, the
 * prompt and the key for the AI are on the AI page (ConnectAi) — set up once,
 * and found where the rest of the AI is.
 */
export default function WorkPanel({ onCount }: { /** How many wait for your confirmation, whenever that changes (the tab's badge). */ onCount?: (count: number) => void } = {}) {
    const t = useTranslations('Work');
    const tList = useTranslations('ReportList');
    const [items, setItems] = useState<Item[] | null>(null);
    const [doneOpen, setDoneOpen] = useState(false);
    // The open sections fold away too (work #47).
    const [todoOpen, setTodoOpen] = useState(true);
    const [awaitingOpen, setAwaitingOpen] = useState(true);
    const [busy, setBusy] = useState(false);
    const selection = useSelection();
    const [ask, dialog] = useConfirm();

    const load = useCallback(
        () =>
            fetch('/api/work-items', { cache: 'no-store' })
                .then((res) => (res.ok ? res.json() : { items: [] }))
                .then((data: { items: Item[] }) => {
                    setItems(data.items);
                    onCount?.(data.items.filter((item) => item.doneAt && !item.closedAt && !item.dismissed).length);
                })
                .catch(() => setItems([])),
        [onCount]
    );

    useEffect(() => {
        void load();
    }, [load]);

    const [actFailed, setActFailed] = useState(false);
    const act = async (id: number, init: RequestInit) => {
        const res = await fetch(`/api/work-items/${id}`, { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null);
        // A confirm that did not go through (the task changed meanwhile)
        // used to look exactly like one that did.
        setActFailed(!res?.ok);
        await load();
    };

    const live = (items ?? []).filter((item) => !item.closedAt && !item.dismissed);
    const awaiting = live.filter((item) => item.doneAt);
    const withAi = live.filter((item) => !item.doneAt);
    const done = (items ?? []).filter((item) => item.closedAt && !item.dismissed);
    // Only finished tasks can be deleted, and only while they are on screen.
    const visible = useMemo(
        () => (doneOpen ? (items ?? []).filter((item) => item.closedAt && !item.dismissed).map((item) => item.id) : []),
        [doneOpen, items]
    );

    const remove = async (ids: number[]) => {
        if (ids.length === 0) return;
        const sure = await ask({ title: tList('deleteQuestion', { count: ids.length }), confirmLabel: tList('deleteConfirm'), destructive: true });
        if (!sure) return;
        setBusy(true);
        const res = await fetch('/api/work-items', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => null);
        setActFailed(!res?.ok);
        if (res?.ok) selection.stop();
        await load();
        setBusy(false);
    };

    return (
        <div>
            {dialog}
            <p className="mb-6 text-sm leading-relaxed text-muted">{t('explainShort')}</p>
            {actFailed && (
                <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {t('actFailed')}
                </p>
            )}

            {items === null ? (
                <Loading label={t('loading')} />
            ) : (
                <>
                    {/* First what only you can do: an AI said it is done. */}
                    {awaiting.length > 0 && (
                        <section className="mb-10">
                            <SectionHeading title={t('awaitingHeading')} count={awaiting.length} hint={t('awaitingHint')} open={awaitingOpen} onToggle={setAwaitingOpen} />
                            {awaitingOpen && (
                            <ul className="flex flex-col gap-3">
                                {awaiting.map((item) => (
                                    <AwaitingRow key={item.id} item={item} onAnswer={(confirm, why) => act(item.id, { method: 'PATCH', body: JSON.stringify({ confirm, why }) })} />
                                ))}
                            </ul>
                            )}
                        </section>
                    )}

                    <section>
                        <SectionHeading title={t('withAiHeading')} count={withAi.length} hint={t('withAiHint')} open={todoOpen} onToggle={setTodoOpen} />
                        {!todoOpen ? null : withAi.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted">{items.length === 0 ? t('empty') : t('noneWithAi')}</p>
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {withAi.map((item) => (
                                    <ItemCard key={item.id}>
                                        <ItemHead item={item} />
                                        {/* Nothing is asked of you here (the section says so), so the
                                            two ways out sit side by side and stay small. */}
                                        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                                            <button type="button" onClick={() => void act(item.id, { method: 'PATCH', body: JSON.stringify({ closed: true }) })} className={buttonSecondary}>
                                                {t('markDoneMyself')}
                                            </button>
                                            <button type="button" title={t('takeBackHint')} onClick={() => void act(item.id, { method: 'DELETE' })} className={buttonSecondary}>
                                                {t('takeBack')}
                                            </button>
                                        </div>
                                    </ItemCard>
                                ))}
                            </ul>
                        )}
                    </section>

                    {done.length > 0 && (
                        <DoneFold title={tList('doneHeading')} count={done.length} open={doneOpen} onToggle={setDoneOpen}>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-muted">{t('doneHint')}</p>
                                <SelectToggle selection={selection} />
                            </div>
                            <ul className="flex flex-col gap-2">
                                {done.map((item) => (
                                    <ItemCard
                                        key={item.id}
                                        tone="quiet"
                                        selecting={selection.selecting}
                                        selected={selection.picked.includes(item.id)}
                                        onToggle={() => selection.toggle(item.id)}
                                        label={`#${item.id}`}
                                    >
                                        <ItemHead item={item} />
                                        {!selection.selecting && (
                                            <CardActions>
                                                <button type="button" onClick={() => void act(item.id, { method: 'PATCH', body: JSON.stringify({ closed: false }) })} className={buttonSecondary}>
                                                    {t('reopen')}
                                                </button>
                                                <button type="button" disabled={busy} onClick={() => void remove([item.id])} className={buttonSecondary}>
                                                    {tList('deleteConfirm')}
                                                </button>
                                            </CardActions>
                                        )}
                                    </ItemCard>
                                ))}
                            </ul>
                        </DoneFold>
                    )}

                    <SelectionBar selection={selection} visible={visible} busy={busy} onDelete={(ids) => void remove(ids)} />
                </>
            )}

            <p className="mt-10 text-sm text-muted">
                {t('connectMoved')}{' '}
                <Link href="/admin/ai" className="underline underline-offset-4">
                    {t('connectMovedLink')}
                </Link>
            </p>
        </div>
    );
}

/** The top of a task card: kind, number, date, how it stands, and the admin's note. */
function ItemHead({ item }: { item: Item }) {
    const t = useTranslations('Work');
    const locale = useLocale();
    return (
        <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <KindBadge strong={item.kind === 'error' && !item.closedAt}>{t(`kind.${item.kind}`)}</KindBadge>
                <span>
                    #{item.id} · {formatDate(new Date(item.createdAt), locale, 'short')}
                    {item.auto && <> · {t('auto')}</>}
                    {item.closedAt && <> · {t(`closedAs.${item.closedReason ?? 'done'}`)}</>}
                </span>
            </div>
            <p className="mt-2 break-words font-medium">{item.title}</p>
            {item.note && (
                <p className="mt-1 whitespace-pre-line text-sm text-muted">
                    {locale === 'de' ? '„' : '“'}
                    {item.note}
                    {locale === 'de' ? '“' : '”'}
                </p>
            )}
        </>
    );
}

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

/** A task the AI reported done: what it says it did, and your answer. */
function AwaitingRow({ item, onAnswer }: { item: Item; onAnswer: (confirm: boolean, why?: string) => Promise<void> }) {
    const t = useTranslations('Work');
    const locale = useLocale();
    const [rejecting, setRejecting] = useState(false);
    const [why, setWhy] = useState('');
    const [busy, setBusy] = useState(false);
    const answer = async (confirm: boolean) => {
        setBusy(true);
        await onAnswer(confirm, confirm ? undefined : why.trim() || undefined);
        setBusy(false);
    };
    return (
        <ItemCard tone="attention">
            <ItemHead item={item} />
            <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm">
                <p className="text-xs text-faint">{t('reportedDone', { date: formatDate(new Date(item.doneAt!), locale, 'short') })}</p>
                {item.doneNote && <p className="mt-1 whitespace-pre-line">{item.doneNote}</p>}
                {item.doneRef && (
                    <a href={item.doneRef} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center underline underline-offset-4">
                        {t('doneRef')}
                        {/* Where it goes, before anybody taps it. */}
                        <span className="ml-1 text-xs text-faint">({hostOf(item.doneRef)})</span>
                    </a>
                )}
            </div>
            <NextStep>{t('nextAwaiting')}</NextStep>
            {rejecting ? (
                <div className="mt-3 flex flex-col gap-2">
                    <input
                        value={why}
                        onChange={(event) => setWhy(event.target.value)}
                        placeholder={t('rejectPlaceholder')}
                        maxLength={1000}
                        aria-label={t('rejectPlaceholder')}
                        className="w-full min-w-0 rounded-lg border border-control bg-transparent px-3 py-2 text-base outline-none focus:border-ink"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button type="button" disabled={busy} onClick={() => void answer(false)} className={buttonPrimary}>
                            {t('rejectSend')}
                        </button>
                        <button type="button" onClick={() => setRejecting(false)} className={buttonSecondary}>
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                    <button type="button" disabled={busy} onClick={() => void answer(true)} className={buttonPrimary}>
                        {t('confirm')}
                    </button>
                    <button type="button" onClick={() => setRejecting(true)} className={`${buttonSecondary} min-h-12 text-base`}>
                        {t('rejectDone')}
                    </button>
                </div>
            )}
        </ItemCard>
    );
}
