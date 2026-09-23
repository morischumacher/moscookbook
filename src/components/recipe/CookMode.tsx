'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { clock, ingredientsInStep, timersIn } from '@/lib/cookSteps';
import type { RunningTimer } from './useCookTimers';
import { buttonPrimaryLarge } from '@/lib/ui';

/**
 * Cooking from the recipe: one step at a time, on a screen that stays on.
 *
 * What the page does in a list, this does at the stove. The step being done
 * fills the screen in large type; under it, what that step needs from the
 * ingredient list, at the amounts being cooked; the times in it are buttons
 * that start a timer. "Done" ticks the step off and moves on, and the overview
 * shows at a glance what is done and what is still to come — the same ticks
 * as on the page, so leaving cook mode and coming back loses nothing.
 *
 * Big targets, swipe between steps, arrow keys on a keyboard. Escape leaves.
 */
export default function CookMode({
    title,
    steps,
    stepTexts,
    ingredients,
    checkedSteps,
    onToggleStep,
    checkedIngredients,
    onToggleIngredient,
    timers,
    now,
    onStartTimer,
    onDismissTimer,
    wakeLockActive,
    onClose,
}: {
    title: string;
    steps: React.ReactNode[];
    stepTexts: string[];
    /** As displayed: scaled and in the chosen units. */
    ingredients: { amount: string; item: string; name: string }[];
    checkedSteps: Set<number>;
    onToggleStep: (index: number, done?: boolean) => void;
    checkedIngredients: Set<number>;
    onToggleIngredient: (index: number) => void;
    timers: RunningTimer[];
    now: number;
    onStartTimer: (label: string, seconds: number, step: number) => void;
    onDismissTimer: (id: number) => void;
    wakeLockActive: boolean;
    onClose: () => void;
}) {
    const t = useTranslations('Recipe');
    const firstOpen = steps.findIndex((_, index) => !checkedSteps.has(index));
    const [current, setCurrent] = useState(firstOpen === -1 ? 0 : firstOpen);
    const [view, setView] = useState<'step' | 'overview' | 'ingredients'>(steps.length === 0 ? 'ingredients' : 'step');
    const touch = useRef<number | null>(null);
    const dialog = useRef<HTMLDivElement>(null);

    const allDone = steps.length > 0 && checkedSteps.size >= steps.length;

    const forStep = useMemo(
        () => stepTexts.map((text) => ingredientsInStep(text, ingredients.map((row) => row.name))),
        [stepTexts, ingredients]
    );
    const timersForStep = useMemo(() => stepTexts.map((text) => timersIn(text)), [stepTexts]);

    const go = (index: number) => setCurrent(Math.max(0, Math.min(steps.length - 1, index)));

    const doneAndNext = () => {
        onToggleStep(current, true);
        const next = steps.findIndex((_, index) => index > current && !checkedSteps.has(index));
        if (next !== -1) go(next);
        else if (current < steps.length - 1) go(current + 1);
    };

    useEffect(() => {
        dialog.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (view !== 'step') return;
            if (event.key === 'ArrowRight') setCurrent((index) => Math.min(steps.length - 1, index + 1));
            if (event.key === 'ArrowLeft') setCurrent((index) => Math.max(0, index - 1));
        };
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
        };
    }, [onClose, steps.length, view]);

    const tab = (which: typeof view, label: string) => (
        <button
            type="button"
            role="tab"
            aria-selected={view === which}
            onClick={() => setView(which)}
            className={`rounded-full px-3 py-1.5 text-sm ${view === which ? 'bg-ink text-page' : 'text-muted'}`}
        >
            {label}
        </button>
    );

    return (
        <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label={t('cookMode')}
            tabIndex={-1}
            className="fixed inset-0 z-[200] flex flex-col bg-page text-ink outline-none"
        >
            {/* Top: where you are. */}
            <header className="border-b border-line px-4 pb-2 pt-3">
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('cookModeExit')}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-xl"
                    >
                        ×
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{title}</p>
                        <p className="text-xs text-muted">{wakeLockActive ? t('screenStaysOn') : t('screenMayDim')}</p>
                    </div>
                    <div role="tablist" className="flex shrink-0 gap-1">
                        {steps.length > 0 && tab('step', t('stepsTab'))}
                        {tab('ingredients', t('ingredientsTab'))}
                        {steps.length > 0 && tab('overview', t('overviewTab'))}
                    </div>
                </div>
                {steps.length > 0 && (
                    <div className="mx-auto mt-2 flex max-w-3xl gap-1" aria-hidden="true">
                        {steps.map((_, index) => (
                            <span
                                key={index}
                                className={`h-1.5 flex-1 rounded-full ${
                                    checkedSteps.has(index) ? 'bg-ink' : index === current && view === 'step' ? 'bg-accent' : 'bg-surface'
                                }`}
                            />
                        ))}
                    </div>
                )}
            </header>

            {/* Running timers, whichever step started them. */}
            {timers.length > 0 && (
                <div className="border-b border-line bg-surface px-4 py-2" role="status" aria-live="polite">
                    <ul className="mx-auto flex max-w-3xl flex-wrap gap-2">
                        {timers.map((timer) => (
                            <li key={timer.id}>
                                <button
                                    type="button"
                                    onClick={() => onDismissTimer(timer.id)}
                                    className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-mono text-lg tabular-nums ${
                                        timer.done ? 'animate-pulse bg-accent text-page motion-reduce:animate-none' : 'border border-line bg-page'
                                    }`}
                                    aria-label={timer.done ? t('timerDoneDismiss', { label: timer.label }) : t('timerStop', { label: timer.label })}
                                >
                                    <span aria-hidden="true">⏱</span>
                                    {timer.done ? t('timerDone') : clock((timer.endsAt - now) / 1000)}
                                    <span className="font-sans text-xs opacity-70">{t('stepShort', { number: timer.step + 1 })}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <main
                className="flex-1 overflow-y-auto px-4 py-6"
                onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
                onTouchEnd={(event) => {
                    const start = touch.current;
                    const end = event.changedTouches[0]?.clientX;
                    touch.current = null;
                    if (view !== 'step' || start === null || end === undefined) return;
                    if (end - start < -70) go(current + 1);
                    if (end - start > 70) go(current - 1);
                }}
            >
                <div className="mx-auto max-w-3xl">
                    {view === 'step' && steps.length > 0 && (
                        <>
                            <p className="text-sm font-bold uppercase tracking-widest text-muted">
                                {t('stepOf', { number: current + 1, total: steps.length })}
                                {checkedSteps.has(current) && <span className="ml-2 text-ink">✓ {t('stepDone')}</span>}
                            </p>
                            <div className={`markdown-step mt-4 text-2xl leading-relaxed sm:text-3xl ${checkedSteps.has(current) ? 'opacity-50' : ''}`}>
                                {steps[current]}
                            </div>

                            {timersForStep[current].length > 0 && (
                                <div className="mt-6 flex flex-wrap gap-2">
                                    {timersForStep[current].map((timer, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => onStartTimer(timer.label, timer.seconds, current)}
                                            className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-ink px-5 text-lg font-semibold"
                                        >
                                            <span aria-hidden="true">⏱</span> {t('startTimer', { label: timer.label })}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {forStep[current].length > 0 && (
                                <section className="mt-8 rounded-2xl bg-surface p-4">
                                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{t('needForStep')}</h2>
                                    <ul className="mt-2 flex flex-col gap-1 text-lg">
                                        {forStep[current].map((index) => (
                                            <li key={index} className={checkedIngredients.has(index) ? 'text-faint line-through' : ''}>
                                                <span className="font-bold">{ingredients[index].amount}</span> {ingredients[index].item}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {allDone && <p className="mt-10 text-center text-xl font-bold">{t('allStepsDone')}</p>}
                        </>
                    )}

                    {view === 'overview' && (
                        <ol className="flex flex-col gap-2">
                            {stepTexts.map((text, index) => {
                                const done = checkedSteps.has(index);
                                return (
                                    <li key={index}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                go(index);
                                                setView('step');
                                            }}
                                            className={`flex w-full items-start gap-3 rounded-xl p-3 text-left ${index === current ? 'bg-surface' : ''}`}
                                        >
                                            <span
                                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                                                    done ? 'bg-ink text-page' : 'border border-line text-muted'
                                                }`}
                                            >
                                                {done ? '✓' : index + 1}
                                            </span>
                                            <span className={`line-clamp-2 pt-1.5 ${done ? 'text-faint line-through' : ''}`}>
                                                {text.replace(/[*_#>`[\]]/g, '')}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    {view === 'ingredients' && (
                        <ul className="flex flex-col divide-y divide-line text-xl">
                            {ingredients.map((row, index) => (
                                <li key={index}>
                                    <label className="flex cursor-pointer items-baseline gap-3 py-3">
                                        <input
                                            type="checkbox"
                                            checked={checkedIngredients.has(index)}
                                            onChange={() => onToggleIngredient(index)}
                                            className="h-6 w-6 shrink-0 accent-black"
                                        />
                                        <span className={checkedIngredients.has(index) ? 'text-faint line-through' : ''}>
                                            <span className="font-bold">{row.amount}</span> {row.item}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </main>

            {/* Bottom: the two things you do with a wooden spoon in the other hand. */}
            {view === 'step' && steps.length > 0 && (
                <footer className="border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                    <div className="mx-auto flex max-w-3xl gap-3">
                        <button
                            type="button"
                            onClick={() => go(current - 1)}
                            disabled={current === 0}
                            className="min-h-14 flex-1 rounded-full border border-line text-lg font-medium disabled:opacity-30"
                        >
                            ← {t('previousStep')}
                        </button>
                        {checkedSteps.has(current) ? (
                            <button
                                type="button"
                                onClick={() => (current < steps.length - 1 ? go(current + 1) : onClose())}
                                className={`${buttonPrimaryLarge} flex-[2]`}
                            >
                                {current < steps.length - 1 ? `${t('nextStep')} →` : t('finishCooking')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={doneAndNext}
                                className={`${buttonPrimaryLarge} flex-[2]`}
                            >
                                ✓ {current < steps.length - 1 ? t('doneNext') : t('doneLast')}
                            </button>
                        )}
                    </div>
                </footer>
            )}
        </div>
    );
}
