'use client';

import ShareToWorkList, { type WorkState } from '@/components/admin/ShareToWorkList';
import ReportPhotos, { type ReportPhoto } from '@/components/admin/ReportPhotos';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/formatDate';
import { buttonPrimarySmall, buttonSecondary } from '@/lib/ui';
import { useCopy } from '@/components/ui/useCopy';
import { useConfirm } from '@/components/ui/useConfirm';
import Loading from '@/components/ui/Loading';
import { CardActions, DoneFold, ItemCard, KindBadge, NextStep, SectionHeading, SelectionBar, SelectToggle, useSelection, WithAiNote } from './ReportSections';

interface TicketRow {
    photos: ReportPhoto[];
    /** On the work list (taken back ones only reach here; see lib/reportSections). */
    work: WorkState | null;
    id: number;
    kind: string;
    body: string;
    path: string | null;
    createdAt: string;
    resolvedAt: string | null;
    user: { name: string } | null;
}

interface Lists {
    todo: TicketRow[];
    done: TicketRow[];
    /** How many open tickets are on the task list instead of here. */
    withAi: number;
}

/**
 * What people have said about the tool, sorted by what it asks of the admin.
 *
 * **To do**: tickets nobody is on yet. Each card says what to decide — have
 * the AI build it, or mark it done — with buttons big enough for a thumb.
 * **With the AI** is not here: a ticket handed over (and every "something is
 * broken" one, which goes by itself) is on the task list, and only counted
 * here with a way there. One thing in two lists was two places to decide.
 * **Done** is folded away, deletable, and selectable for deleting many.
 *
 * The page a ticket came from is shown as written: it is the most useful
 * line in most of them, and a link would be a tap that loses the list.
 *
 * A failed request shows as a failure, never as an empty list: on a page
 * whose job is "here is what people told you", "nothing" would be the most
 * misleading thing it could say.
 */
export default function TicketsPanel({ onShowWork, onCount }: { onShowWork?: () => void; /** How many need you, whenever that changes (the tab's badge). */ onCount?: (count: number) => void }) {
    const t = useTranslations('Tickets');
    const tList = useTranslations('ReportList');
    const locale = useLocale();

    const [lists, setLists] = useState<Lists>({ todo: [], done: [], withAi: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [doneOpen, setDoneOpen] = useState(false);
    // The open section folds away too, like the one below it (work #47).
    const [todoOpen, setTodoOpen] = useState(true);
    const [busy, setBusy] = useState(false);
    const selection = useSelection();
    const [ask, dialog] = useConfirm();
    const { copy, copied, failed: copyRefused } = useCopy();

    const load = useCallback(async () => {
        setError('');
        try {
            const res = await fetch('/api/tickets', { cache: 'no-store' });
            if (!res.ok) throw new Error(t('loadFailed'));
            const next: Lists = await res.json();
            setLists(next);
            onCount?.(next.todo.length);
        } catch {
            setLists({ todo: [], done: [], withAi: 0 });
            setError(t('loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [t, onCount]);

    useEffect(() => {
        void load();
    }, [load]);

    /** Only what is on screen can be selected: "Done" counts once it is open. */
    const visible = useMemo(
        () => [...lists.todo.map((entry) => entry.id), ...(doneOpen ? lists.done.map((entry) => entry.id) : [])],
        [lists, doneOpen]
    );

    const send = async (method: 'PATCH' | 'DELETE', body: object) => {
        setBusy(true);
        try {
            const res = await fetch('/api/tickets', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) setError(tList('failed'));
            return res.ok;
        } catch {
            setError(tList('failed'));
            return false;
        } finally {
            await load();
            setBusy(false);
        }
    };

    const setResolved = (ids: number[], resolved: boolean) => send('PATCH', { ids, resolved });

    const remove = async (ids: number[]) => {
        if (ids.length === 0) return;
        const sure = await ask({
            title: tList('deleteQuestion', { count: ids.length }),
            body: tList('deleteBody'),
            confirmLabel: tList('deleteConfirm'),
            destructive: true,
        });
        if (!sure) return;
        if (await send('DELETE', { ids })) selection.stop();
    };

    /**
     * The ticket as a block of text, ready to paste wherever it gets fixed:
     * the page, the date and the words, in no particular tool's format.
     */
    const asTicket = (entry: TicketRow) =>
        [
            `[${t(`kind_${entry.kind}`)}] ${entry.body.trim()}`,
            '',
            entry.path ? `Page:   ${entry.path}` : null,
            `From:   ${entry.user?.name ?? t('someone')} · ${formatDateTime(new Date(entry.createdAt), locale)}`,
            `Ticket: #${entry.id}`,
        ]
            .filter((line) => line !== null)
            .join('\n');

    /** What needs the admin, as Markdown, for pasting where it is worked through. */
    const asMarkdown = () =>
        [
            `# ${t('adminTitle')} — ${tList('todoHeading')}`,
            '',
            ...lists.todo.flatMap((entry) => [
                `## ${t(`kind_${entry.kind}`)} · #${entry.id}`,
                '',
                entry.body.trim(),
                '',
                `- ${entry.user?.name ?? t('someone')}`,
                `- ${formatDateTime(new Date(entry.createdAt), locale)}`,
                ...(entry.path ? [`- \`${entry.path}\``] : []),
                '',
            ]),
        ].join('\n');

    const head = (entry: TicketRow) => (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <KindBadge strong={entry.kind === 'problem'}>{t(`kind_${entry.kind}`)}</KindBadge>
            <span>
                #{entry.id} · {entry.user?.name ?? t('someone')} · {formatDateTime(new Date(entry.createdAt), locale)}
            </span>
        </div>
    );

    if (loading) return <Loading label={t('loading')} className="mt-8" />;

    return (
        <div>
            {dialog}
            <p className="mb-4 text-sm leading-relaxed text-muted">{t('adminExplanationShort')}</p>

            <WithAiNote count={lists.withAi} onShow={onShowWork} />

            {error && (
                <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-danger-surface p-3">
                    <p className="text-sm text-danger">{error}</p>
                </div>
            )}
            {copyRefused && (
                <p role="alert" className="mb-4 text-sm text-danger">
                    {t('copyFailed')}
                </p>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <SectionHeading title={tList('todoHeading')} count={lists.todo.length} hint={t('todoHint')} open={todoOpen} onToggle={setTodoOpen} />
                <div className="flex flex-wrap gap-2">
                    {lists.todo.length > 0 && (
                        <button type="button" onClick={() => void copy(asMarkdown(), 'all')} className={buttonSecondary}>
                            {copied === 'all' ? t('copied') : t('exportMarkdown')}
                        </button>
                    )}
                    <SelectToggle selection={selection} disabled={lists.todo.length + lists.done.length === 0} />
                </div>
            </div>
            {selection.selecting && <p className="mb-3 text-sm text-muted">{tList('selectHint')}</p>}

            {todoOpen && (
                <>
{lists.todo.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted">{t('noneTodo')}</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {lists.todo.map((entry) => (
                        <ItemCard
                            key={entry.id}
                            selecting={selection.selecting}
                            selected={selection.picked.includes(entry.id)}
                            onToggle={() => selection.toggle(entry.id)}
                            label={`#${entry.id}`}
                        >
                            {head(entry)}
                            <p className="mt-2 whitespace-pre-wrap font-serif leading-relaxed text-ink">{entry.body}</p>
                            <ReportPhotos photos={entry.photos} />
                            {entry.path && <p className="mt-2 break-all font-mono text-xs text-muted">{entry.path}</p>}

                            <NextStep>{entry.kind === 'problem' ? t('nextProblem') : t('nextIdea')}</NextStep>
                            {!selection.selecting && (
                                <CardActions>
                                    <ShareToWorkList
                                        kind="ticket"
                                        id={entry.id}
                                        work={entry.work}
                                        photoCount={entry.photos.length}
                                        key={`w-${entry.id}-${entry.work?.id ?? 0}`}
                                        buttonClassName={buttonPrimarySmall}
                                        onChange={() => void load()}
                                    />
                                    <button type="button" disabled={busy} onClick={() => void setResolved([entry.id], true)} className={buttonSecondary}>
                                        {tList('markDone')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void copy(asTicket(entry), entry.id)}
                                        title={t('ticketHint')}
                                        className="min-h-11 text-sm text-muted underline underline-offset-4 hover:text-ink sm:px-2"
                                    >
                                        {copied === entry.id ? t('copied') : t('copyTicket')}
                                    </button>
                                </CardActions>
                            )}
                        </ItemCard>
                    ))}
                </ul>
            )}
                </>
            )}

            {lists.done.length > 0 && (
                <DoneFold title={tList('doneHeading')} count={lists.done.length} open={doneOpen} onToggle={setDoneOpen}>
                    <ul className="flex flex-col gap-2">
                        {lists.done.map((entry) => (
                            <ItemCard
                                key={entry.id}
                                tone="quiet"
                                selecting={selection.selecting}
                                selected={selection.picked.includes(entry.id)}
                                onToggle={() => selection.toggle(entry.id)}
                                label={`#${entry.id}`}
                            >
                                {head(entry)}
                                <p className="mt-2 line-clamp-3 whitespace-pre-wrap font-serif text-sm leading-relaxed">{entry.body}</p>
                                {entry.resolvedAt && <p className="mt-1 text-xs text-faint">{t('doneCard', { date: formatDateTime(new Date(entry.resolvedAt), locale) })}</p>}
                                {!selection.selecting && (
                                    <CardActions>
                                        <button type="button" disabled={busy} onClick={() => void setResolved([entry.id], false)} className={buttonSecondary}>
                                            {t('reopen')}
                                        </button>
                                    </CardActions>
                                )}
                            </ItemCard>
                        ))}
                    </ul>
                </DoneFold>
            )}

            <SelectionBar
                selection={selection}
                visible={visible}
                busy={busy}
                onDelete={(ids) => void remove(ids)}
                extra={(ids) => {
                    const open = ids.filter((id) => lists.todo.some((entry) => entry.id === id));
                    return open.length > 0 ? (
                        <button type="button" disabled={busy} onClick={() => void setResolved(open, true).then((ok) => ok && selection.stop())} className={buttonSecondary}>
                            {tList('markDoneCount', { count: open.length })}
                        </button>
                    ) : null;
                }}
            />
        </div>
    );
}
