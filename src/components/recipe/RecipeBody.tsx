'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import type { Ingredient } from '@/lib/recipe';
import { scaleAmount } from '@/lib/amount';
import { splitSteps } from '@/lib/steps';

const SERVING_STEPS = [1, 2, 3, 4, 6, 8, 10, 12];

export default function RecipeBody({
    ingredients,
    instructions,
    baseServings,
}: {
    ingredients: Ingredient[];
    instructions: string;
    baseServings: number | null;
}) {
    const [servings, setServings] = useState(baseServings ?? 0);
    const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
    const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
    const [cookMode, setCookMode] = useState(false);
    const [wakeLockActive, setWakeLockActive] = useState(false);
    const wakeLock = useRef<WakeLockSentinel | null>(null);

    const t = useTranslations('Recipe');

    const steps = useMemo(() => splitSteps(instructions), [instructions]);

    const factor = baseServings && servings ? servings / baseServings : 1;

    // Keeping the screen awake is an external system, so it lives in an effect;
    // the state flag only exists to tell the cook whether it actually worked.
    useEffect(() => {
        if (!cookMode) return;

        let cancelled = false;

        const acquire = async () => {
            const api: WakeLock | undefined = navigator.wakeLock;
            if (!api) return;
            try {
                const sentinel = await api.request('screen');
                if (cancelled) {
                    sentinel.release().catch(() => undefined);
                    return;
                }
                wakeLock.current = sentinel;
                setWakeLockActive(true);
            } catch {
                // Denied or unsupported — cook mode still works, the screen just dims.
            }
        };

        acquire();

        // Switching tabs drops the lock; take it again on return.
        const onVisibility = () => {
            if (document.visibilityState === 'visible') acquire();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisibility);
            wakeLock.current?.release().catch(() => undefined);
            wakeLock.current = null;
            setWakeLockActive(false);
        };
    }, [cookMode]);

    const toggle = (set: Set<number>, index: number) => {
        const next = new Set(set);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
    };

    const reset = () => {
        setCheckedIngredients(new Set());
        setCheckedSteps(new Set());
        setServings(baseServings ?? 0);
    };

    const textSize = cookMode ? 'text-2xl sm:text-3xl' : 'text-xl';

    return (
        <div className={cookMode ? 'cook-mode' : undefined}>
            {/* Controls */}
            <div className="print:hidden mb-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-gray-200 py-4 dark:border-gray-800">
                {baseServings ? (
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold uppercase tracking-widest text-gray-500">
                            {t('servings')}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setServings((value) => Math.max(1, value - 1))}
                                aria-label={t('oneLess')}
                                className="h-9 w-9 rounded-full border border-gray-300 text-lg leading-none hover:border-gray-900 dark:border-gray-700 dark:hover:border-white"
                            >
                                −
                            </button>
                            <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
                                {servings}
                            </span>
                            <button
                                type="button"
                                onClick={() => setServings((value) => Math.min(100, value + 1))}
                                aria-label={t('oneMore')}
                                className="h-9 w-9 rounded-full border border-gray-300 text-lg leading-none hover:border-gray-900 dark:border-gray-700 dark:hover:border-white"
                            >
                                +
                            </button>
                        </div>
                        <div className="hidden gap-1 sm:flex">
                            {SERVING_STEPS.filter((value) => value !== servings).slice(0, 4).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setServings(value)}
                                    className="rounded-full px-2 py-0.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
                                >
                                    {value}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                <button
                    type="button"
                    onClick={() => setCookMode((open) => !open)}
                    aria-pressed={cookMode}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${cookMode
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'border border-gray-300 hover:border-gray-900 dark:border-gray-700 dark:hover:border-white'
                        }`}
                >
                    {cookMode ? t('cookModeExit') : t('cookMode')}
                </button>

                <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:hover:text-white"
                >
                    {t('print')}
                </button>

                {(checkedIngredients.size > 0 || checkedSteps.size > 0) && (
                    <button
                        type="button"
                        onClick={reset}
                        className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:hover:text-white"
                    >
                        {t('reset')}
                    </button>
                )}

                {cookMode && (
                    <span className="text-sm text-gray-500">
                        {wakeLockActive ? t('screenStaysOn') : t('tapToCheck')}
                    </span>
                )}
            </div>

            {/* Ingredients */}
            <section className="mb-16">
                <h2 className="mb-8 inline-block border-b-2 border-[#111] pb-1 font-sans text-2xl font-bold uppercase tracking-widest text-[#111] dark:border-[#eee] dark:text-[#eee]">
                    {t('ingredients')}
                </h2>

                {ingredients.length === 0 ? (
                    <p className="text-gray-500">{t('noIngredients')}</p>
                ) : (
                    <ul className={`flex flex-col gap-4 ${textSize} leading-relaxed text-[#222] dark:text-[#ddd]`}>
                        {ingredients.map((ingredient, index) => {
                            const checked = checkedIngredients.has(index);
                            return (
                                <li key={index} className="border-b border-gray-200 pb-4 dark:border-gray-800">
                                    <label className="flex cursor-pointer items-baseline gap-3">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                                setCheckedIngredients((set) => toggle(set, index))
                                            }
                                            className="print:hidden mt-1 h-5 w-5 shrink-0 cursor-pointer accent-black dark:accent-white"
                                        />
                                        <span
                                            className={`flex flex-1 items-baseline gap-3 transition-opacity ${checked ? 'opacity-40 line-through' : ''
                                                }`}
                                        >
                                            <span className="w-24 shrink-0 font-sans font-bold text-[#111] dark:text-[#eee] sm:w-32">
                                                {scaleAmount(ingredient.amount, factor)}
                                            </span>
                                            <span>{ingredient.item}</span>
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {baseServings && factor !== 1 && (
                    <p className="print:hidden mt-4 text-sm text-gray-500">
                        {t('scaledFrom', { base: baseServings, current: servings })}
                    </p>
                )}
            </section>

            {/* Instructions */}
            <section>
                <h2 className="mb-8 inline-block border-b-2 border-[#111] pb-1 font-sans text-2xl font-bold uppercase tracking-widest text-[#111] dark:border-[#eee] dark:text-[#eee]">
                    {t('instructions')}
                </h2>

                <ol className={`flex flex-col gap-8 ${textSize} leading-relaxed text-[#222] dark:text-[#ddd]`}>
                    {steps.map((step, index) => {
                        const checked = checkedSteps.has(index);
                        return (
                            <li key={index} className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setCheckedSteps((set) => toggle(set, index))}
                                    aria-pressed={checked}
                                    aria-label={t('checkStep', { number: index + 1 })}
                                    className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-sans text-sm font-bold transition-colors ${checked
                                        ? 'border-transparent bg-black text-white dark:bg-white dark:text-black'
                                        : 'border-gray-300 text-gray-500 dark:border-gray-700'
                                        }`}
                                >
                                    {checked ? '✓' : index + 1}
                                </button>
                                <div
                                    className={`markdown-step flex-1 transition-opacity ${checked ? 'opacity-40' : ''
                                        }`}
                                >
                                    <ReactMarkdown>{step}</ReactMarkdown>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </section>
        </div>
    );
}
