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

interface ErrorRow {
    photos: ReportPhoto[];
    work: WorkState | null;
    id: number;
    source: string;
    message: string;
    stack: string | null;
    path: string | null;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
    resolvedAt: string | null;
}

interface Lists {
    todo: ErrorRow[];
    done: ErrorRow[];
    withAi: number;
}

/**
 * What is broken, sorted by what it asks of the admin — the same sections as
 * the tickets (lib/reportSections).
 *
 * Most errors never need the admin: every one the server sees or a signed-in
 * person runs into is a task for the AI by itself, and is counted here with a
 * way to the task list rather than listed twice. What is left under "To do"
 * is what nobody is on: anonymous reports, and ones taken back from the AI.
 *
 * One row per problem, not per occurrence, with a count, so this stays
 * something you can read rather than a log you scroll past. A failed request
 * shows as a failure — "nothing is failing" must never be said when the
 * truth is "could not ask".
 */
export default function ErrorsPanel({ onShowWork, onCount }: { onShowWork?: () => void; /** How many need you, whenever that changes (the tab's badge). */ onCount?: (count: number) => void }) {
    const t = useTranslations('Errors');
    const tList = useTranslations('ReportList');
    // The site's language, not the browser's.
    const locale = useLocale();

    const [lists, setLists] = useState<Lists>({ todo: [], done: [], withAi: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);
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
            const res = await fetch('/api/errors', { cache: 'no-store' });
            if (!res.ok) throw new Error(t('loadFailed'));
            const next: Lists = await res.json();
            setLists(next);
            onCount?.(next.todo.length);
        } catch (err) {
            setLists({ todo: [], done: [], withAi: 0 });
            setError(err instanceof Error ? err.message : t('loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [t, onCount]);

    useEffect(() => {
        void load();
    }, [load]);

    const visible = useMemo(
        () => [...lists.todo.map((row) => row.id), ...(doneOpen ? lists.done.map((row) => row.id) : [])],
        [lists, doneOpen]
    );

    const send = async (method: 'PATCH' | 'DELETE', body: object) => {
        setBusy(true);
        try {
            const res = await fetch('/api/errors', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

    /** What needs the admin as Markdown, stacks in fences, for pasting where it gets fixed. */
    const asMarkdown = () =>
        [
            `# ${t('title')} — ${tList('todoHeading')}`,
            '',
            ...lists.todo.flatMap((row) => [
                `## ${row.message}`,
                '',
                `- ${t(`source.${row.source}`)} · ${t('seen', { count: row.count })}`,
                `- ${formatDateTime(row.lastSeenAt, locale)}`,
                ...(row.path ? [`- \`${row.path}\``] : []),
                '',
                ...(row.stack ? ['```', row.stack.trim(), '```', ''] : []),
            ]),
        ].join('\n');

    const head = (row: ErrorRow) => (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <KindBadge strong={!row.resolvedAt}>{t(`source.${row.source}`)}</KindBadge>
            <span>
                {t('seen', { count: row.count })} · <time dateTime={row.lastSeenAt}>{formatDateTime(row.lastSeenAt, locale)}</time>
            </span>
        </div>
    );

    const stack = (row: ErrorRow) =>
        row.stack && (
            <button type="button" onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="min-h-11 text-sm text-muted underline underline-offset-4 sm:px-2">
                {expanded === row.id ? t('hideStack') : t('showStack')}
            </button>
        );

    if (loading) return <Loading label={t('loading')} />;

    return (
        <div>
            {dialog}
            <p className="mb-4 text-sm leading-relaxed text-muted">{t('explanationShort')}</p>

            <WithAiNote count={lists.withAi} onShow={onShowWork} />

            {error && (
                <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-danger-surface p-3">
                    <p className="text-sm text-danger">{error}</p>
                    <button type="button" onClick={() => void load()} className="min-h-11 text-sm font-medium text-danger underline underline-offset-4">
                        {t('retry')}
                    </button>
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
{error ? null : lists.todo.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted">{t('allQuiet')}</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {lists.todo.map((row) => (
                        <ItemCard key={row.id} selecting={selection.selecting} selected={selection.picked.includes(row.id)} onToggle={() => selection.toggle(row.id)} label={row.message}>
                            {head(row)}
                            <p className="mt-2 break-words font-mono text-sm leading-snug">{row.message}</p>
                            {row.path && <p className="mt-1 break-all text-sm text-muted">{row.path}</p>}
                            <ReportPhotos photos={row.photos} attachTo={row.id} />
                            <NextStep>{t('nextError')}</NextStep>
                            {!selection.selecting && (
                                <CardActions>
                                    <ShareToWorkList
                                        kind="error"
                                        id={row.id}
                                        work={row.work}
                                        photoCount={row.photos.length}
                                        key={`w-${row.id}-${row.work?.id ?? 0}`}
                                        buttonClassName={buttonPrimarySmall}
                                        onChange={() => void load()}
                                    />
                                    <button type="button" disabled={busy} onClick={() => void setResolved([row.id], true)} className={buttonSecondary}>
                                        {t('resolve')}
                                    </button>
                                    {stack(row)}
                                </CardActions>
                            )}
                            {expanded === row.id && row.stack && (
                                <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed">{row.stack}</pre>
                            )}
                        </ItemCard>
                    ))}
                </ul>
            )}
                </>
            )}

            {lists.done.length > 0 && (
                <DoneFold title={t('doneHeading')} count={lists.done.length} open={doneOpen} onToggle={setDoneOpen}>
                    {/* Where the finished ones are, as on the task list: select, then delete. */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted">{tList('doneSelectHint')}</p>
                        <SelectToggle selection={selection} />
                    </div>
                    <ul className="flex flex-col gap-2">
                        {lists.done.map((row) => (
                            <ItemCard key={row.id} tone="quiet" selecting={selection.selecting} selected={selection.picked.includes(row.id)} onToggle={() => selection.toggle(row.id)} label={row.message}>
                                {head(row)}
                                <p className="mt-2 line-clamp-3 break-words font-mono text-sm leading-snug">{row.message}</p>
                                {!selection.selecting && (
                                    <CardActions>
                                        <button type="button" disabled={busy} onClick={() => void remove([row.id])} className={buttonSecondary}>
                                            {t('delete')}
                                        </button>
                                        {stack(row)}
                                    </CardActions>
                                )}
                                {expanded === row.id && row.stack && (
                                    <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed">{row.stack}</pre>
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
                    const open = ids.filter((id) => lists.todo.some((row) => row.id === id));
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
