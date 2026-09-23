'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { clock, ingredientsInStep, timersIn } from '@/lib/cookSteps';
import type { RunningTimer } from './useCookTimers';
import { buttonPrimaryLarge } from '@/lib/ui';

/**
 * Cooking from the recipe, on a screen that stays on.
 *
 * Two ways to cook, one set of ticks:
 *
 * - **Abhaken** (the default): the recipe, simplified and large — the
 *   ingredients, then the steps, each a big row to tick off, with the times
 *   in a step as buttons that start a timer. The whole thing at a glance.
 * - **Schritt für Schritt**: one step filling the screen, what it needs from
 *   the ingredient list under it, "done" moving on. For those who want it.
 *
 * "Fertig gekocht" clears the ticks and closes; "Von vorn" clears them and
 * stays. Ticks also expire after twelve hours (lib/cookProgress).
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
    onFinish,
    onStartOver,
}: {
    title: string;
    steps: React.ReactNode[];
    stepTexts: string[];
    /** As displayed: scaled and in the chosen units. */
    ingredients: { amount: string; item: string; name: string; section: string | null }[];
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
    /** Cooked: the ticks are cleared and cook mode closes. */
    onFinish: () => void;
    /** The ticks cleared, staying in cook mode. */
    onStartOver: () => void;
}) {
    const t = useTranslations('Recipe');
    const firstOpen = steps.findIndex((_, index) => !checkedSteps.has(index));
    const [current, setCurrent] = useState(firstOpen === -1 ? 0 : firstOpen);
    const [view, setView] = useState<'list' | 'step'>('list');
    const touch = useRef<number | null>(null);
    const dialog = useRef<HTMLDivElement>(null);

    const allDone = steps.length > 0 && steps.every((_, index) => checkedSteps.has(index));

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
            onClick={() => {
                if (which === 'step') {
                    const open = steps.findIndex((_, index) => !checkedSteps.has(index));
                    setCurrent(open === -1 ? 0 : open);
                }
                setView(which);
            }}
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
                        {tab('list', t('cookViewList'))}
                        {steps.length > 0 && tab('step', t('cookViewSteps'))}
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
                                            {t('startTimer', { label: timer.label })}
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

                    {view === 'list' && (
                        <>
                            {ingredients.length > 0 && (
                                <section>
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-muted">{t('ingredients')}</h2>
                                    <ul className="mt-2 flex flex-col divide-y divide-line text-xl">
                                        {ingredients.map((row, index) => (
                                            <li key={index}>
                                                {row.section && row.section !== ingredients[index - 1]?.section && (
                                                    <h3 className="pb-1 pt-5 text-sm font-bold uppercase tracking-widest text-muted">{row.section}</h3>
                                                )}
                                                <label className="flex min-h-14 cursor-pointer items-center gap-4 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={checkedIngredients.has(index)}
                                                        onChange={() => onToggleIngredient(index)}
                                                        className="h-7 w-7 shrink-0 accent-black"
                                                    />
                                                    <span className={checkedIngredients.has(index) ? 'text-faint line-through' : ''}>
                                                        <span className="font-bold">{row.amount}</span> {row.item}
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {steps.length > 0 && (
                                <section className="mt-10">
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-muted">{t('instructions')}</h2>
                                    <ol className="mt-3 flex flex-col gap-3">
                                        {steps.map((step, index) => {
                                            const done = checkedSteps.has(index);
                                            return (
                                                <li key={index} className={`rounded-2xl border p-4 ${done ? 'border-transparent bg-surface' : 'border-line'}`}>
                                                    <div className="flex items-start gap-4">
                                                        <button
                                                            type="button"
                                                            onClick={() => onToggleStep(index)}
                                                            aria-pressed={done}
                                                            aria-label={t('checkStep', { number: index + 1 })}
                                                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                                                                done ? 'bg-ink text-page' : 'border-2 border-ink'
                                                            }`}
                                                        >
                                                            {done ? '✓' : index + 1}
                                                        </button>
                                                        <div
                                                            className={`markdown-step flex-1 cursor-pointer pt-1.5 text-xl leading-relaxed ${done ? 'text-faint' : ''}`}
                                                            onClick={() => onToggleStep(index)}
                                                        >
                                                            {step}
                                                        </div>
                                                    </div>
                                                    {!done && timersForStep[index].length > 0 && (
                                                        <div className="mt-3 flex flex-wrap gap-2 pl-16">
                                                            {timersForStep[index].map((timer, timerIndex) => (
                                                                <button
                                                                    key={timerIndex}
                                                                    type="button"
                                                                    onClick={() => onStartTimer(timer.label, timer.seconds, index)}
                                                                    className="inline-flex min-h-11 items-center rounded-full border border-ink px-4 text-base font-semibold"
                                                                >
                                                                    {t('startTimer', { label: timer.label })}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </section>
                            )}

                            {allDone && <p className="mt-10 text-center text-xl font-bold">{t('allStepsDone')}</p>}

                            {/* The end of a cooking: ticks cleared for next time. */}
                            <div className="mt-10 flex flex-col items-center gap-3 pb-6">
                                <button type="button" onClick={onFinish} className={`${buttonPrimaryLarge} w-full sm:w-auto sm:px-12`}>
                                    {t('cookFinish')}
                                </button>
                                <button type="button" onClick={onStartOver} className="text-sm text-muted underline underline-offset-4">
                                    {t('startOver')}
                                </button>
                            </div>
                        </>
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
                                onClick={() => (current < steps.length - 1 ? go(current + 1) : onFinish())}
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
