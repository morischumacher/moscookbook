'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatAmount, type StructuredIngredient } from '@/lib/ingredientParts';
import ShareButton from '@/components/share/ShareButton';
import AddToShopping from '@/components/shopping/AddToShopping';
import { buttonFloating, buttonPrimarySmall } from '@/lib/ui';
import CookMode from './CookMode';
import { useCookTimers } from './useCookTimers';
import { clock } from '@/lib/cookSteps';
import { formatMeasured, hasNonMetric, tidy, toMetric, unitOf, type UnitSystem } from '@/lib/units';
import { cookProgressKey, parseCookProgress, worthSaving } from '@/lib/cookProgress';
import PrintSheet, { type PrintInfo } from './PrintSheet';


export default function RecipeBody({
    recipeId,
    ingredients,
    steps,
    stepTexts,
    print,
    canShop,
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
    /** The same steps as text, for what cook mode reads out of them: timers, ingredients. */
    stepTexts: string[];
    /** The printed sheet's header (components/recipe/PrintSheet). */
    print?: PrintInfo;
    /** Whether "add to shopping list" is offered — people with an account. */
    canShop: boolean;
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
        /** Only the admins read it (lib/shareStage, "admins"). */
        onlyMe?: boolean;
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

    const { timers, now, start: startTimer, dismiss: dismissTimer } = useCookTimers(`moscookbook:timers:${recipeId}`);
    const uiLocale = (locale === 'en' ? 'en' : 'de') as 'en' | 'de';

    /*
     * Grams and millilitres by default, with the recipe's own units one tap
     * away. Remembered per device, because somebody who wants cups wants them
     * on every recipe. Offered only where it changes anything.
     */
    const convertible = hasNonMetric(ingredients);
    const [system, setSystem] = useState<UnitSystem>('metric');
    useEffect(() => {
        try {
            const saved = window.localStorage.getItem('unit-system');
            // eslint-disable-next-line react-hooks/set-state-in-effect -- read from the browser's storage after hydration
            if (saved === 'original' || saved === 'metric') setSystem(saved);
        } catch {
            // Storage blocked: metric it is.
        }
    }, []);
    const chooseSystem = (next: UnitSystem) => {
        setSystem(next);
        try {
            window.localStorage.setItem('unit-system', next);
        } catch {
            // Only this page, then.
        }
    };

    /**
     * An amount as this cook wants to read it: scaled, in their units, tidied
     * (1500 g → 1,5 kg). Written exactly as the recipe had it when nothing
     * about it changed.
     */
    const amountOf = (row: StructuredIngredient): string => {
        if (row.quantity === null) return row.raw || row.unit || '';
        const scaled = {
            quantity: row.quantity * factor,
            quantityMax: row.quantityMax === null ? null : row.quantityMax * factor,
            unit: row.unit,
        };
        const unit = unitOf(row.unit);
        const converts = system === 'metric' && unit !== null && !unit.metric;
        if (factor === 1 && !converts) return row.raw || formatAmount(row, 1, uiLocale);
        const shown = converts ? toMetric(scaled, row.name, uiLocale) : unit ? tidy(scaled, uiLocale) : scaled;
        return formatMeasured(shown, uiLocale, (parts) => formatAmount(parts, 1, uiLocale));
    };

    const displayed = ingredients.map((row) => ({ amount: amountOf(row), item: row.name, name: row.name, section: row.section ?? null }));

    const setStep = (index: number, done?: boolean) =>
        setCheckedSteps((set) => {
            const next = new Set(set);
            const on = done ?? !next.has(index);
            if (on) next.add(index);
            else next.delete(index);
            return next;
        });

    // Keeping the screen awake is an external system, so it lives in an effect;
    // the state flag only exists to tell the cook whether it actually worked.
    // Also while a timer runs outside cook mode: a phone that goes to sleep
    // does not ring.
    const timing = timers.some((timer) => !timer.done);
    const keepAwake = cookMode || timing;

    useEffect(() => {
        if (!keepAwake) return;

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
                // Lost (the system took it back): say so rather than go on
                // claiming the screen stays on.
                sentinel.addEventListener('release', () => setWakeLockActive(false));
            } catch {
                // Denied or unsupported — cook mode still works, the screen just dims.
                setWakeLockActive(false);
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
    }, [keepAwake]);

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
                window.localStorage.getItem(cookProgressKey(recipeId, locale))
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
                // Only ticks that still point at a line: the recipe may have
                // been edited since, and a tick past the end made cook mode
                // say "all done" with a step still open.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setCheckedIngredients(new Set(saved.ingredients.filter((index) => index < ingredients.length)));
                setCheckedSteps(new Set(saved.steps.filter((index) => index < stepTexts.length)));
                if (saved.servings !== null) setServings(saved.servings);
            }
        } catch {
            // Private window, blocked storage. Cooking still works.
        }

        restored.current = true;
    }, [recipeId, locale, ingredients.length, stepTexts.length]);

    useEffect(() => {
        if (!restored.current) return;

        const key = cookProgressKey(recipeId, locale);
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
    }, [recipeId, locale, checkedIngredients, checkedSteps, servings, baseServings]);

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

    /** Ticks from an unfinished cooking, restored from this device. */
    const cooking = checkedIngredients.size > 0 || checkedSteps.size > 0;

    const textSize = 'text-xl';

    return (
        <>
        {print && (
            <PrintSheet
                title={title}
                info={print}
                servingsLabel={t('servings')}
                servings={baseServings ? servings : null}
                ingredients={displayed.map((row) => ({ amount: row.amount, item: row.item, section: row.section }))}
                ingredientsHeading={t('ingredients')}
                steps={steps}
                stepsHeading={t('instructions')}
                scaledNote={baseServings && factor !== 1 ? t('scaledFrom', { base: baseServings, current: servings }) : null}
            />
        )}
        {/* On paper the sheet above stands in for all of this. */}
        <div className={print ? 'print:hidden' : undefined}>
            {/* Controls */}
            {/* Sans, whatever the article around it is set in: these are controls,
                and in the serif they read as footnotes. */}
            <div className="print:hidden mb-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line py-4 [font-family:var(--font-sans)]">
                {baseServings ? (
                    // Wraps: the label and the stepper are
                    // wider than a phone, and a row that cannot wrap made the
                    // whole page scroll sideways.
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
                                {/* "4" alone, announced, says nothing. */}
                                <span className="sr-only"> {t('servings')}</span>
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
                    </div>
                ) : null}

                {/* The two things done with a recipe in the kitchen, as the
                    largest targets on the page: full width on a phone, where
                    they are pressed with one hand. */}
                {/* items-start: the "on the list" line under the shopping button
                    made the row taller, and the cook button stretched with it. */}
                <div className="flex w-full flex-wrap items-start gap-3 sm:w-auto">
                    <button
                        type="button"
                        onClick={() => setCookMode(true)}
                        className={`${buttonPrimarySmall} flex-1 gap-2 sm:flex-none`}
                    >
                        {cooking ? t('resumeCooking') : t('cookModeStart')}
                    </button>
                    {canShop && <AddToShopping recipeId={recipeId} servings={baseServings ? servings : null} />}
                </div>

                {convertible && (
                    <div role="group" aria-label={t('units')} className="flex rounded-full border border-line p-0.5 text-sm">
                        {(['metric', 'original'] as const).map((which) => (
                            <button
                                key={which}
                                type="button"
                                aria-pressed={system === which}
                                onClick={() => chooseSystem(which)}
                                className={`rounded-full px-3 py-1.5 ${system === which ? 'bg-ink text-page' : 'text-muted'}`}
                            >
                                {which === 'metric' ? t('unitsMetric') : t('unitsOriginal')}
                            </button>
                        ))}
                    </div>
                )}

                <ShareButton
                    id={recipeId}
                    kind="recipe"
                    title={title}
                    locale={locale}
                    isPublic={share.isPublic}
                    linkUrl={share.linkUrl}
                    onlyMe={share.onlyMe}
                    ownUrl={share.ownUrl}
                    mayChange={share.mayChange}
                    className="-my-2 py-3 text-sm text-muted underline underline-offset-4 hover:text-ink"
                />

                <button
                    type="button"
                    onClick={() => window.print()}
                    className="-my-2 py-3 text-sm text-muted underline underline-offset-4 hover:text-ink"
                >
                    {t('print')}
                </button>
            </div>

            {cookMode && (
                <CookMode
                    title={title}
                    steps={steps}
                    stepTexts={stepTexts}
                    ingredients={displayed}
                    checkedSteps={checkedSteps}
                    onToggleStep={setStep}
                    checkedIngredients={checkedIngredients}
                    onToggleIngredient={(index) => setCheckedIngredients((set) => toggle(set, index))}
                    timers={timers}
                    now={now}
                    onStartTimer={startTimer}
                    onDismissTimer={dismissTimer}
                    wakeLockActive={wakeLockActive}
                    onClose={() => setCookMode(false)}
                    onFinish={() => {
                        reset();
                        setCookMode(false);
                    }}
                    onStartOver={reset}
                />
            )}

            {/* Timers keep running when cook mode is left, and say so. */}
            {!cookMode && timers.length > 0 && (
                <button
                    type="button"
                    onClick={() => setCookMode(true)}
                    className={`${buttonFloating} print:hidden font-mono tabular-nums`}
                >
                    <span aria-hidden="true">⏱</span>
                    {timers.some((timer) => timer.done)
                        ? t('timerDone')
                        : clock(Math.min(...timers.map((timer) => timer.endsAt - now)) / 1000)}
                </button>
            )}

            {/*
                The page itself is for reading: the ticks live in cook mode.
                If a cooking was left half done on this device, it says so
                here — once, with the way back in and the way to start over.
            */}
            {!cookMode && cooking && (
                <div className="print:hidden mb-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface px-4 py-3 font-sans text-sm">
                    <span className="text-muted">
                        {t('resumeBanner', { done: checkedSteps.size, total: steps.length })}
                    </span>
                    <button type="button" onClick={() => setCookMode(true)} className="font-medium underline underline-offset-4">
                        {t('resumeCooking')}
                    </button>
                    <button type="button" onClick={reset} className="text-muted underline underline-offset-4 hover:text-ink">
                        {t('startOver')}
                    </button>
                </div>
            )}

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
                            // Scaling happens on the stored number, not on the
                            // printed string, so "1/2 TL" x3 gives "1 1/2 TL".
                            const ingredient = displayed[index];
                            // A heading where the section changes: "Für den
                            // Teig", then what goes into it.
                            const heading =
                                ingredient.section && ingredient.section !== displayed[index - 1]?.section
                                    ? ingredient.section
                                    : null;
                            return (
                                <li key={index} className="border-b border-line pb-4">
                                    {heading && (
                                        <h3 className="mb-2 mt-4 font-sans text-sm font-bold uppercase tracking-widest text-muted">
                                            {heading}
                                        </h3>
                                    )}
                                    <div className="flex items-baseline gap-3 py-1.5">
                                        <span className="w-24 shrink-0 font-sans font-bold text-ink sm:w-32">
                                            {ingredient.amount}
                                        </span>
                                        <span>{ingredient.item}</span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {/* On paper too: the printed header says the recipe's own
                    servings, and amounts for six under "4 Portionen" would be
                    read as amounts for four. */}
                {baseServings && factor !== 1 && (
                    <p className="mt-4 text-sm text-muted">
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
                    {steps.map((step, index) => (
                        <li key={index} className="flex gap-4">
                            <span
                                aria-hidden="true"
                                className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line font-sans text-sm font-bold text-muted"
                            >
                                {index + 1}
                            </span>
                            <div className="markdown-step flex-1">{step}</div>
                        </li>
                    ))}
                </ol>
            </section>
        </div>
        </>
    );
}
