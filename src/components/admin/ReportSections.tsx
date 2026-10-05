'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { buttonDanger, buttonSecondary } from '@/lib/ui';
import { visibleSelection } from '@/lib/reportSections';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * The pieces the ticket, error and task panels are built from, so the three
 * read the same way: sections with a heading and a count, a card per item
 * that says what to do next, "done" folded away, and a selection mode that
 * only ever acts on what is on screen.
 *
 * The panels grew separately and each answered "what is where, and what do I
 * have to do" differently — or not at all: tiny underlined links, a
 * checkbox on every row whether or not anything was being selected, and the
 * finished items mixed in with the open ones.
 */

/** A section's heading: what it is, how many, and one line on what it asks of you. */
export function SectionHeading({ title, count, hint }: { title: string; count: number; hint?: string }) {
    return (
        <div className="mb-3">
            <h3 className="flex items-center gap-2 text-base font-bold">
                {title}
                <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-surface px-2 text-sm font-semibold text-muted">{count}</span>
            </h3>
            {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
    );
}

/** One item: a bordered card, with room for a checkbox while selecting. */
export function ItemCard({
    children,
    selecting = false,
    selected = false,
    onToggle,
    label,
    tone = 'plain',
}: {
    children: ReactNode;
    selecting?: boolean;
    selected?: boolean;
    onToggle?: () => void;
    /** What the checkbox selects, for a screen reader. */
    label?: string;
    /** `attention` for the one thing only you can do (a confirmation). */
    tone?: 'plain' | 'attention' | 'quiet';
}) {
    const border = selected ? 'border-ink' : tone === 'attention' ? 'border-accent' : 'border-line';
    return (
        <li className={`flex gap-3 rounded-xl border ${border} bg-page p-4 ${tone === 'quiet' ? 'text-muted' : ''}`}>
            {selecting && (
                // The whole strip is the target, not a 16px box.
                <label className="-my-2 -ml-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-start justify-center pt-2">
                    <input type="checkbox" checked={selected} onChange={onToggle} aria-label={label} className="h-5 w-5 accent-current" />
                </label>
            )}
            <div className="min-w-0 flex-1">{children}</div>
        </li>
    );
}

/** "Next: …" — the line on every card that says what this item wants from you. */
export function NextStep({ children }: { children: ReactNode }) {
    const t = useTranslations('ReportList');
    return (
        <p className="mt-3 text-sm">
            <span className="font-semibold">{t('next')}</span> <span className="text-muted">{children}</span>
        </p>
    );
}

/** The buttons under a card: a row on a wide screen, stacked full width on a phone. */
export function CardActions({ children }: { children: ReactNode }) {
    return <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

/** A small label for the kind of item, at the top of its card. */
export function KindBadge({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                strong ? 'bg-danger-surface text-danger' : 'bg-surface text-muted'
            }`}
        >
            {children}
        </span>
    );
}

/** "Done (12)", folded away; open state is the panel's, so selection knows what is visible. */
export function DoneFold({
    title,
    count,
    open,
    onToggle,
    children,
}: {
    title: string;
    count: number;
    open: boolean;
    onToggle: (open: boolean) => void;
    children: ReactNode;
}) {
    return (
        <details open={open} onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)} className="group mt-10 rounded-xl border border-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="shrink-0 text-faint transition-transform group-open:rotate-90">
                    ▸
                </span>
                <span className="font-bold">{title}</span>
                <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-surface px-2 text-sm font-semibold text-muted">{count}</span>
            </summary>
            <div className="border-t border-line p-3">{children}</div>
        </details>
    );
}

/** "3 with the AI →": what left this list, and where it went. */
export function WithAiNote({ count, onShow }: { count: number; onShow?: () => void }) {
    const t = useTranslations('ReportList');
    if (count === 0) return null;
    const text = t('withAiNote', { count });
    return onShow ? (
        <button type="button" onClick={onShow} className="mb-6 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 text-left text-sm">
            <span>{text}</span>
            <span className="shrink-0 whitespace-nowrap font-medium underline underline-offset-4">{t('withAiShow')} →</span>
        </button>
    ) : (
        <p className="mb-6 rounded-xl bg-surface px-4 py-3 text-sm">{text}</p>
    );
}

/** Which items are selected, and whether checkboxes are showing at all. */
export function useSelection() {
    const [selecting, setSelecting] = useState(false);
    const [picked, setPicked] = useState<number[]>([]);
    const toggle = useCallback((id: number) => setPicked((now) => (now.includes(id) ? now.filter((other) => other !== id) : [...now, id])), []);
    const stop = useCallback(() => {
        setSelecting(false);
        setPicked([]);
    }, []);
    return { selecting, setSelecting, picked, setPicked, toggle, stop };
}

/**
 * The bar that appears while selecting: how many, select all of what is
 * visible, and the actions. Sticky at the bottom, so it is under the thumb
 * however long the list.
 */
export function SelectionBar({
    selection,
    visible,
    busy,
    onDelete,
    extra,
}: {
    selection: ReturnType<typeof useSelection>;
    /** The ids on screen right now; only these can be selected or acted on. */
    visible: number[];
    busy: boolean;
    onDelete: (ids: number[]) => void;
    /** Further actions for the selected ids (e.g. "Mark done"). */
    extra?: (ids: number[]) => ReactNode;
}) {
    const t = useTranslations('ReportList');
    const ids = useMemo(() => visibleSelection(selection.picked, visible), [selection.picked, visible]);
    if (!selection.selecting) return null;
    const all = visible.length > 0 && ids.length === visible.length;
    return (
        <div role="region" aria-label={t('selectionBar')} className="sticky bottom-3 z-40 mt-6 rounded-2xl border border-ink bg-page p-3 shadow-lg">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold" aria-live="polite">
                    {t('selectedCount', { count: ids.length })}
                </p>
                <button type="button" onClick={() => selection.setPicked(all ? [] : visible)} disabled={visible.length === 0} className="min-h-11 text-sm underline underline-offset-4 disabled:opacity-50">
                    {all ? t('selectNone') : t('selectAll', { count: visible.length })}
                </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {extra?.(ids)}
                <button type="button" disabled={busy || ids.length === 0} onClick={() => onDelete(ids)} className={buttonDanger}>
                    <BusyLabel busy={busy}>{t('deleteCount', { count: ids.length })}</BusyLabel>
                </button>
                <button type="button" onClick={selection.stop} className={buttonSecondary}>
                    {t('selectStop')}
                </button>
            </div>
        </div>
    );
}

/** The toggle that starts selecting. */
export function SelectToggle({ selection, disabled = false }: { selection: ReturnType<typeof useSelection>; disabled?: boolean }) {
    const t = useTranslations('ReportList');
    return (
        <button
            type="button"
            aria-pressed={selection.selecting}
            disabled={disabled}
            onClick={() => (selection.selecting ? selection.stop() : selection.setSelecting(true))}
            className={buttonSecondary}
        >
            {selection.selecting ? t('selectStop') : t('select')}
        </button>
    );
}
