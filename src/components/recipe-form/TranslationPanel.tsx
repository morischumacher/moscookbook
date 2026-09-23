'use client';

import { useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useTranslations } from 'next-intl';
import { buttonSecondary } from '@/lib/ui';
import IngredientEditor from './IngredientEditor';
import { fieldClass, labelClass } from './formStyles';
import {
    otherLanguage,
    sourceKey,
    type RecipeLanguage,
    type RecipeTranslationInput,
    type TranslatableRecipe,
} from '@/lib/recipeTranslation';

/**
 * The recipe in its other language: the language it is written in, a button
 * that has the AI translate it (amounts and units included), and the result
 * as fields that can be corrected before saving.
 *
 * Saved with the recipe, so a reader of the other language sees text somebody
 * looked at. When the recipe changes afterwards the panel says so, rather
 * than quietly keeping a translation of an older version.
 */
export default function TranslationPanel({
    original,
    language,
    onLanguage,
    translation,
    onTranslation,
    available,
}: {
    original: TranslatableRecipe;
    language: RecipeLanguage;
    onLanguage: (next: RecipeLanguage) => void;
    translation: RecipeTranslationInput | null;
    onTranslation: (next: RecipeTranslationInput | null) => void;
    /** False when the AI is off: the button is drawn, greyed, with where to turn it on. */
    available: boolean;
}) {
    const t = useTranslations('RecipeForm');
    const tAi = useTranslations('Ai');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');

    const target = otherLanguage(language);
    // A translation into the language the recipe is written in is not one.
    const current = translation && translation.locale === target ? translation : null;
    const stale = current !== null && current.source !== '' && current.source !== sourceKey(original);
    const empty = original.title.trim() === '' || original.ingredients.every((row) => row.item.trim() === '');

    const run = async () => {
        setBusy(true);
        setNote('');
        try {
            const res = await fetch('/api/ai/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: language, ...original }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 501) return setNote(tAi('polishOff'));
            if (!res.ok) return setNote(sayable(data?.message, t('translateFailed')));
            if (data.ok === false) return setNote(t('translateUnusable'));

            onTranslation(data.translation);
        } catch {
            setNote(t('translateFailed'));
        } finally {
            setBusy(false);
        }
    };

    const edit = (patch: Partial<RecipeTranslationInput>) => current && onTranslation({ ...current, ...patch });

    return (
        <div className="space-y-4 rounded-xl border border-line p-4">
            <div>
                <p className={labelClass}>{t('translationHeading')}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <span className="text-muted">{t('writtenIn')}</span>
                    {(['de', 'en'] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={language === option}
                            onClick={() => onLanguage(option)}
                            className={
                                language === option
                                    ? 'rounded-full border border-ink px-3 py-1 font-bold'
                                    : 'rounded-full border border-control px-3 py-1 text-muted'
                            }
                        >
                            {t(`language.${option}`)}
                        </button>
                    ))}
                </div>
            </div>

            {current === null ? (
                <div>
                    <button
                        type="button"
                        onClick={run}
                        disabled={!available || busy || empty}
                        className={buttonSecondary}
                    >
                        {busy ? t('translating') : t(`translateTo.${target}`)}
                    </button>
                    <p className="mt-2 text-sm text-faint">
                        {available ? t('translateHint') : tAi('polishOff')}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-muted">{t(`translationOf.${target}`)}</p>

                    {stale && (
                        <p className="rounded-lg border border-control p-3 text-sm">
                            {t('translationStale')}{' '}
                            <button
                                type="button"
                                onClick={run}
                                disabled={!available || busy}
                                className="underline underline-offset-4 disabled:text-faint"
                            >
                                {busy ? t('translating') : t('translateAgain')}
                            </button>
                        </p>
                    )}

                    <div>
                        <label htmlFor="translation-title" className={labelClass}>{t('title')}</label>
                        <input
                            id="translation-title"
                            lang={target}
                            value={current.title}
                            onChange={(event) => edit({ title: event.target.value })}
                            className={fieldClass}
                        />
                    </div>

                    <div>
                        <label htmlFor="translation-description" className={labelClass}>{t('description')}</label>
                        <textarea
                            id="translation-description"
                            lang={target}
                            rows={3}
                            value={current.description}
                            onChange={(event) => edit({ description: event.target.value })}
                            className={fieldClass}
                        />
                    </div>

                    {/* The editor brings its own heading. */}
                    <IngredientEditor
                        ingredients={current.ingredients}
                        onChange={(rows) => edit({ ingredients: rows })}
                    />

                    <div>
                        <label htmlFor="translation-instructions" className={labelClass}>{t('instructions')}</label>
                        <textarea
                            id="translation-instructions"
                            lang={target}
                            rows={10}
                            value={current.instructions}
                            onChange={(event) => edit({ instructions: event.target.value })}
                            className={fieldClass + ' font-mono text-sm'}
                        />
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm">
                        {!stale && (
                            <button
                                type="button"
                                onClick={run}
                                disabled={!available || busy}
                                className="underline underline-offset-4 disabled:text-faint"
                            >
                                {busy ? t('translating') : t('translateAgain')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onTranslation(null)}
                            className="text-muted underline underline-offset-4"
                        >
                            {t('translationRemove')}
                        </button>
                    </div>
                </div>
            )}

            {note && <p className="text-sm text-muted">{note}</p>}
        </div>
    );
}
