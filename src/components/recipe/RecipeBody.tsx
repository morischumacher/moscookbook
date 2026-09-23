'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toDisplayIngredient, type StructuredIngredient } from '@/lib/ingredientParts';
import ShareButton from '@/components/share/ShareButton';
import { cookProgressKey, parseCookProgress, worthSaving } from '@/lib/cookProgress';

const SERVING_STEPS = [1, 2, 3, 4, 6, 8, 10, 12];

export default function RecipeBody({
    recipeId,
    ingredients,
    steps,
    baseServings,
    title,
    locale,
    share,
}: {
    /** Which recipe's progress is being remembered. */
    recipeId: number;
    ingredients: StructuredIngredient[];
    /**
     * The method, one rendered step each.
     *
     * Rendered on the server by RecipeArticle and handed in finished. The
     * Markdown parser used to come to every visitor's phone with this
     * component — a third of a recipe page's own script, to turn a dozen
     * short paragraphs into HTML that could have been sent as HTML.
     */
    steps: React.ReactNode[];
    baseServings: number | null;
    /** For the share sheet, which offers it as the message's subject. */
    title: string;
    locale: string;
    /**
     * Everything the share control needs: where it stands and who may change
     * it. Passed as one object because the three fields are one answer — who
     * can see this — and three loose props are three chances to hand over a
     * link that does not match the state beside it.
     */
    share: {
        isPublic: boolean;
        linkUrl: string | null;
        ownUrl: string;
        mayChange: boolean;
    };
}) {
    const [servings, setServings] = useState(baseServings ?? 0);
    const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
    const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
    /**
     * Whether the stored progress has been looked for yet.
     *
     * The page is rendered on the server as well, where there is no storage to
     * read, so the marks can only arrive after hydration — and until they have,
     * nothing may be written: the empty starting state saving itself over a
     * real record is how this would destroy rather than protect.
     *
     * A ref rather than state, because nothing on screen depends on it. Effects
     * run in the order they are declared, so by the time the writing one runs
     * the reading one has already finished.
     */
    const restored = useRef(false);
    const [cookMode, setCookMode] = useState(false);
    const [wakeLockActive, setWakeLockActive] = useState(false);
    const wakeLock = useRef<WakeLockSentinel | null>(null);

    const t = useTranslations('Recipe');

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

    /*
     * What a cook has ticked off survives the tab being thrown away.
     *
     * All of this lived in component state only, and on a phone that means it
     * lived until the next interruption: Safari discards backgrounded tabs as a
     * matter of routine, so answering a message halfway through a recipe lost
     * every check mark with nothing to say it had happened. See lib/cookProgress
     * — including why it expires after twelve hours rather than waiting for you.
     */
    useEffect(() => {
        try {
            const saved = parseCookProgress(
                window.localStorage.getItem(cookProgressKey(recipeId))
            );

            if (saved) {
                /*
                 * react-hooks/set-state-in-effect is right about the general
                 * case and wrong about this one. The values live in the
                 * browser's storage, this component is rendered on the server
                 * too, and seeding the state during render would hand the
                 * client different markup than the server sent — a hydration
                 * mismatch, which is a worse bug than one extra render.
                 *
                 * The usual escape, useSyncExternalStore, derives a value from
                 * the store on every render. That is right for "does a draft
                 * exist" and wrong here: these are the starting point for state
                 * the cook then changes, not a mirror of what is stored.
                 */
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setCheckedIngredients(new Set(saved.ingredients));
                setCheckedSteps(new Set(saved.steps));
                if (saved.servings !== null) setServings(saved.servings);
            }
        } catch {
            // Private window, blocked storage. Cooking still works.
        }

        restored.current = true;
    }, [recipeId]);

    useEffect(() => {
        if (!restored.current) return;

        const key = cookProgressKey(recipeId);
        const progress = {
            ingredients: [...checkedIngredients],
            steps: [...checkedSteps],
            servings,
        };

        try {
            // Nothing ticked and the servings untouched is not progress, it is
            // a recipe somebody opened — and leaving a record for every one of
            // those would fill the browser with nothing.
            if (worthSaving(progress, baseServings)) {
                window.localStorage.setItem(key, JSON.stringify({ ...progress, at: Date.now() }));
            } else {
                window.localStorage.removeItem(key);
            }
        } catch {
            // Storage is a convenience here, never a requirement.
        }
    }, [recipeId, checkedIngredients, checkedSteps, servings, baseServings]);

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
        // The effect above then removes the record, because an empty one is
        // not worth saving.
    };

    const textSize = cookMode ? 'text-2xl sm:text-3xl' : 'text-xl';

    return (
        <div className={cookMode ? 'cook-mode' : undefined}>
            {/* Controls */}
            <div className="print:hidden mb-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line py-4">
                {baseServings ? (
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold uppercase tracking-widest text-muted">
                            {t('servings')}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setServings((value) => Math.max(1, value - 1))}
                                aria-label={t('oneLess')}
                                // 44px, not 36. This is pressed mid-cook with
                                // wet hands, and 44 is the size Apple's own
                                // guidance gives for a target you have to hit
                                // without looking properly.
                                className="h-11 w-11 rounded-full border border-line text-lg leading-none hover:border-ink"
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
                                className="h-11 w-11 rounded-full border border-line text-lg leading-none hover:border-ink"
                            >
                                +
                            </button>
                        </div>
                        {/* The shortcuts were `hidden sm:flex`, which put them
                            on the machine that has a keyboard and took them
                            away from the one that does not. Going from four
                            servings to twelve on a phone was eight taps on a
                            small button; it is one here. */}
                        <div className="flex gap-1">
                            {SERVING_STEPS.filter((value) => value !== servings).slice(0, 4).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setServings(value)}
                                    className="h-11 min-w-11 rounded-full px-2 text-sm text-muted hover:text-ink"
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
                        ? 'bg-ink text-page'
                        : 'border border-line hover:border-ink  '
                        }`}
                >
                    {cookMode ? t('cookModeExit') : t('cookMode')}
                </button>

                <ShareButton
                    id={recipeId}
                    kind="recipe"
                    title={title}
                    locale={locale}
                    isPublic={share.isPublic}
                    linkUrl={share.linkUrl}
                    ownUrl={share.ownUrl}
                    mayChange={share.mayChange}
                    className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                />

                <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                >
                    {t('print')}
                </button>

                {(checkedIngredients.size > 0 || checkedSteps.size > 0) && (
                    <button
                        type="button"
                        onClick={reset}
                        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                    >
                        {t('reset')}
                    </button>
                )}

                {cookMode && (
                    <span className="text-sm text-muted">
                        {wakeLockActive ? t('screenStaysOn') : t('tapToCheck')}
                    </span>
                )}
            </div>

            {/* Ingredients */}
            <section className="mb-16">
                <h2 className="mb-8 inline-block border-b-2 border-ink pb-1 font-sans text-2xl font-bold uppercase tracking-widest text-ink">
                    {t('ingredients')}
                </h2>

                {ingredients.length === 0 ? (
                    <p className="text-muted">{t('noIngredients')}</p>
                ) : (
                    <ul className={`flex flex-col gap-4 ${textSize} leading-relaxed text-ink`}>
                        {ingredients.map((row, index) => {
                            const checked = checkedIngredients.has(index);
                            // Scaling happens on the stored number, not on the
                            // printed string, so "1/2 TL" x3 gives "1 1/2 TL".
                            const ingredient = toDisplayIngredient(row, factor);
                            return (
                                <li key={index} className="border-b border-line pb-4">
                                    {/* The whole line is the target, with
                                        enough height that hitting it needs no
                                        aim — the box itself is only where the
                                        mark appears. */}
                                    <label className="flex cursor-pointer items-baseline gap-3 py-1.5">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                                setCheckedIngredients((set) => toggle(set, index))
                                            }
                                            // The box is 24px and the label
                                            // around it is the real target, so
                                            // the row has padding rather than
                                            // the checkbox having a size nobody
                                            // would draw.
                                            className="print:hidden mt-1 h-6 w-6 shrink-0 cursor-pointer accent-black"
                                        />
                                        <span
                                            className={`flex flex-1 items-baseline gap-3 transition-opacity ${checked ? 'opacity-40 line-through' : ''
                                                }`}
                                        >
                                            <span className="w-24 shrink-0 font-sans font-bold text-ink sm:w-32">
                                                {ingredient.amount}
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
                    <p className="print:hidden mt-4 text-sm text-muted">
                        {t('scaledFrom', { base: baseServings, current: servings })}
                    </p>
                )}
            </section>

            {/* Instructions */}
            <section>
                <h2 className="mb-8 inline-block border-b-2 border-ink pb-1 font-sans text-2xl font-bold uppercase tracking-widest text-ink">
                    {t('instructions')}
                </h2>

                <ol className={`flex flex-col gap-8 ${textSize} leading-relaxed text-ink`}>
                    {steps.map((step, index) => {
                        const checked = checkedSteps.has(index);
                        return (
                            <li key={index} className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setCheckedSteps((set) => toggle(set, index))}
                                    aria-pressed={checked}
                                    aria-label={t('checkStep', { number: index + 1 })}
                                    // 44px: a step is ticked off with a
                                    // wooden spoon in the other hand.
                                    className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border font-sans text-sm font-bold transition-colors ${checked
                                        ? 'border-transparent bg-ink text-page'
                                        : 'border-line text-muted '
                                        }`}
                                >
                                    {checked ? '✓' : index + 1}
                                </button>
                                <div
                                    className={`markdown-step flex-1 transition-opacity ${checked ? 'opacity-40' : ''
                                        }`}
                                >
                                    {step}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </section>
        </div>
    );
}
