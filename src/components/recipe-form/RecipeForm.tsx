'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import ReactMarkdown from 'react-markdown';
import { StorePicture } from '@/components/ui/InlinePicture';
import { slugify, type Ingredient } from '@/lib/recipe';
import { partsOf } from '@/lib/ingredientShape';
import { formReadyRows } from '@/lib/formRows';
import PolishPanel from './PolishPanel';
import TranslationPanel from './TranslationPanel';
import { guessLanguage, type RecipeLanguage, type RecipeTranslationInput } from '@/lib/recipeTranslation';
import GalleryField from './GalleryField';
import TagField from './TagField';
import IngredientEditor, { EMPTY_ROW } from './IngredientEditor';
import { fieldClass, labelClass } from './formStyles';
import QuickImport, { type ImportedDraft } from './QuickImport';
import { buttonPrimary, buttonSecondary } from '@/lib/ui';
import { BusyLabel } from '@/components/ui/Busy';
import LabelPicker from './LabelPicker';
import DietPicker from './DietPicker';
import { CATEGORY_PRESETS, CUISINE_PRESETS } from '@/lib/recipeLabels';
import { KNOWN_TAGS } from '@/lib/tags';
import { followedRows, syncedRows } from '@/lib/ingredientMatch';

export interface RecipeFormValues {
    id?: number;
    title: string;
    slug: string;
    description: string;
    category: string;
    nationality: string;
    instructions: string;
    /** Tips & notes, markdown; optional. */
    tips?: string;
    ingredients: Ingredient[];
    /** In the order they should be shown; the first one is the cover. */
    imageUrls: string[];
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    tags: string[];
    /** Every category and cuisine; `category` / `nationality` are the first. */
    categories?: string[];
    cuisines?: string[];
    spiciness?: number;
    /** The language it is written in, when known. */
    language?: RecipeLanguage | null;
    /** The recipe in its other language, if it has been translated. */
    translation?: RecipeTranslationInput | null;
}

/** A list from the lists if there are any, else from the single field. */
const listOf = (list: string[] | undefined, single: string | undefined) =>
    list && list.length > 0 ? list : single ? [single] : [];



/** A row with an ingredient in it — a heading counts; preparation, notes or "optional" alone do not. */
const named = (row: Ingredient) => partsOf(row.item).base.trim() !== '';

export default function RecipeForm({
    mode,
    initial,
    aiEnabled,
    captureId,
    version,
    knownCategories = [],
}: {
    mode: 'create' | 'edit';
    /** Categories already used by recipes, offered alongside the usual ones. */
    knownCategories?: string[];
    initial?: Partial<RecipeFormValues>;
    aiEnabled: boolean;
    /**
     * Set when this form was opened from the inbox. Passed back on save so the
     * capture is marked done in the same request — otherwise finishing a
     * recipe by hand would leave its capture sitting in the queue, and a queue
     * with stale entries stops being read.
     */
    captureId?: number;
    /** The recipe as the form opened it (lib/recipeVersion), sent back on save. */
    version?: string;
}) {
    const t = useTranslations('RecipeForm');
    const router = useRouter();

    const initialIngredients = useMemo(() => {
        const rows = initial?.ingredients ?? [];
        return rows.length > 0 ? rows : [{ ...EMPTY_ROW }];
    }, [initial?.ingredients]);

    const [title, setTitle] = useState(initial?.title ?? '');
    const [slug, setSlug] = useState(initial?.slug ?? '');
    const [slugTouched, setSlugTouched] = useState(mode === 'edit');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [categories, setCategories] = useState<string[]>(listOf(initial?.categories, initial?.category));
    const [cuisines, setCuisines] = useState<string[]>(listOf(initial?.cuisines, initial?.nationality));
    const [spiciness, setSpiciness] = useState<number>(initial?.spiciness ?? 0);
    const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
    const [imageUrls, setImageUrls] = useState<string[]>(initial?.imageUrls ?? []);
    const [instructions, setInstructions] = useState(initial?.instructions ?? '');
    const [tips, setTips] = useState(initial?.tips ?? '');
    const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients);
    const [servings, setServings] = useState<string>(
        initial?.servings != null ? String(initial.servings) : ''
    );
    const [prepMinutes, setPrepMinutes] = useState<string>(
        initial?.prepMinutes != null ? String(initial.prepMinutes) : ''
    );
    const [cookMinutes, setCookMinutes] = useState<string>(
        initial?.cookMinutes != null ? String(initial.cookMinutes) : ''
    );

    // Chosen, or guessed from the text until somebody chooses; fixed as soon
    // as there is a translation, so typing cannot flip it under one.
    const [chosenLanguage, setChosenLanguage] = useState<RecipeLanguage | null>(initial?.language ?? null);
    const [translation, setTranslation] = useState<RecipeTranslationInput | null>(initial?.translation ?? null);
    const language: RecipeLanguage =
        chosenLanguage ??
        guessLanguage([title, description, instructions, ...ingredients.map((row) => row.item)].join(' '));

    const [preview, setPreview] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    /**
     * Where the error is, so the page can be moved to it.
     *
     * The banner sits above the form and the save button is about seven
     * hundred pixels below it. On a phone that meant pressing Save and having
     * nothing whatsoever change: the reason was on screen, just not on the
     * part of the screen anybody was looking at.
     */
    const errorBox = useRef<HTMLDivElement>(null);
    const [draftFound, setDraftFound] = useState(false);
    // The recipe has been saved elsewhere since this draft was begun.
    const [draftStale, setDraftStale] = useState(false);
    // The copy the form opened with, kept with a draft to tell whether the
    // recipe changed underneath it.
    const baseline = useMemo(() => JSON.stringify(initial ?? null), [initial]);

    // A form opened from the inbox has a draft of its own: it must not replace
    // an unrelated new recipe that was being typed.
    const newKey = captureId ? `moscookbook:draft:capture:${captureId}` : 'moscookbook:draft:new';
    const draftKey = mode === 'create' ? newKey : `moscookbook:draft:${initial?.id}`;

    // Slug follows the title until the author edits it by hand.
    useEffect(() => {
        if (!slugTouched) setSlug(slugify(title));
    }, [title, slugTouched]);

    // Restore an interrupted draft rather than silently overwriting it.
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(draftKey);
            if (raw) {
                setDraftFound(true);
                const base = (JSON.parse(raw) as { _base?: string })._base;
                setDraftStale(mode === 'edit' && base !== undefined && base !== baseline);
            }
        } catch {
            // Private mode or blocked storage — drafts are a convenience, not a requirement.
        }
    }, [draftKey, mode, baseline]);

    const values = useMemo(
        () => ({
            title, slug, description, categories, cuisines, spiciness, imageUrls, instructions, tips,
            ingredients, servings, prepMinutes, cookMinutes, tags,
            // The translation too: it was a paid call and possibly corrected by hand.
            language: chosenLanguage, translation,
        }),
        [
            title, slug, description, categories, cuisines, spiciness, imageUrls, instructions, tips,
            ingredients, servings, prepMinutes, cookMinutes, tags, chosenLanguage, translation,
        ]
    );

    // The form as it opened. A draft is only worth keeping once it differs:
    // saved on every visit, an untouched copy lingered and was offered later
    // over a recipe that had changed since — and restoring it put back old
    // pictures whose files were already deleted.
    const opened = useRef<string | null>(null);

    useEffect(() => {
        const now = JSON.stringify(values);
        if (opened.current === null) opened.current = now;
        const isEmpty = !title && !instructions && !ingredients.some(named);
        // Not while an interrupted draft is waiting to be restored or thrown
        // away: saving now would overwrite it with the page as it loaded.
        if (isEmpty || draftFound || now === opened.current) return;

        const timer = setTimeout(() => {
            try {
                window.localStorage.setItem(draftKey, JSON.stringify({ ...values, _base: baseline }));
            } catch {
                /* ignore */
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [values, draftKey, title, instructions, ingredients, draftFound, baseline]);

    const clearDraft = () => {
        try {
            window.localStorage.removeItem(draftKey);
        } catch {
            /* ignore */
        }
        setDraftFound(false);
    };

    const restoreDraft = () => {
        try {
            const raw = window.localStorage.getItem(draftKey);
            if (!raw) return;
            const draft = JSON.parse(raw) as Partial<RecipeFormValues>;

            setTitle(draft.title ?? '');
            setSlug(draft.slug ?? '');
            setSlugTouched(true);
            setDescription(draft.description ?? '');
            setCategories(listOf(draft.categories, draft.category));
            setCuisines(listOf(draft.cuisines, draft.nationality));
            setSpiciness(draft.spiciness ?? 0);
            setTags(draft.tags ?? []);
            setImageUrls(draft.imageUrls ?? []);
            setInstructions(draft.instructions ?? '');
            // A draft kept before recipes had tips says nothing about them.
            setTips(draft.tips ?? initial?.tips ?? '');
            setIngredients(
                draft.ingredients && draft.ingredients.length > 0 ? draft.ingredients : [{ ...EMPTY_ROW }]
            );
            setServings(draft.servings != null ? String(draft.servings) : '');
            setPrepMinutes(draft.prepMinutes != null ? String(draft.prepMinutes) : '');
            setCookMinutes(draft.cookMinutes != null ? String(draft.cookMinutes) : '');
            setChosenLanguage(draft.language ?? null);
            setTranslation(draft.translation ?? null);
        } catch {
            /* ignore */
        }
        setDraftFound(false);
    };

    const applyImport = (draft: ImportedDraft) => {
        // Only fill fields the import actually knows about, so a second import
        // never wipes something already typed.
        if (draft.title) setTitle(draft.title);
        if (draft.description) setDescription(draft.description);
        if (draft.category) setCategories((current) => (current.includes(draft.category) ? current : [draft.category, ...current].slice(0, 5)));
        if (draft.nationality) setCuisines((current) => (current.includes(draft.nationality) ? current : [draft.nationality, ...current].slice(0, 5)));
        if (draft.instructions) setInstructions(draft.instructions);
        // Appended rather than replacing: a second import — pasting text after
        // importing a link, say — must not throw away pictures already there.
        const imported = draft.imageUrl;
        if (imported) {
            setImageUrls((current) => (current.includes(imported) ? current : [...current, imported]));
        }
        // The cookbook's way at once, as every way in (lib/formRows): the rules put right what the reader got wrong.
        if (draft.ingredients.length > 0) setIngredients(formReadyRows(draft.ingredients, guessLanguage([draft.title, ...draft.ingredients.map((row) => row.item)].join(' '))));
        if (draft.servings != null) setServings(String(draft.servings));
        if (draft.prepMinutes != null) setPrepMinutes(String(draft.prepMinutes));
        if (draft.cookMinutes != null) setCookMinutes(String(draft.cookMinutes));
    };

    /** Empty stays empty: an unanswered field must not become a wrong number. */
    const toOptionalNumber = (value: string): number | null => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };

    /**
     * Shows the person the thing that just went wrong.
     *
     * Called from everywhere an error is set, rather than from an effect on
     * `error`: the same message twice in a row would not change the state and
     * so would not scroll, and the second failure is exactly when somebody is
     * most confused about why nothing is happening.
     */
    const failWith = (message: string) => {
        setError(message);

        // After the render that puts the banner on the page.
        requestAnimationFrame(() => {
            errorBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    };

    const handleSubmit = async (event: React.FormEvent, isDraft = false) => {
        event.preventDefault();
        setError('');

        // A row with no ingredient is no row, whatever its other fields hold ("(optional)" ticked on the empty last row).
        const cleanedIngredients = ingredients.filter(named);

        if (!title.trim() || !instructions.trim()) {
            failWith(t('requiredFields'));
            return;
        }

        // Said here, in the form's language, rather than by the server in
        // English: a recipe needs at least one ingredient to be shopped for,
        // scaled or cooked from.
        if (cleanedIngredients.length === 0) {
            failWith(t('needIngredient'));
            return;
        }

        setSaving(true);
        let saved = false;
        try {
            const endpoint = mode === 'create' ? '/api/recipes' : `/api/recipes/${initial?.id}`;
            const res = await fetch(endpoint, {
                method: mode === 'create' ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    slug: slug || slugify(title),
                    description,
                    category: categories[0] ?? '',
                    nationality: cuisines[0] ?? '',
                    categories,
                    cuisines,
                    spiciness,
                    tags,
                    imageUrls,
                    instructions,
                    tips,
                    ingredients: cleanedIngredients,
                    servings: toOptionalNumber(servings),
                    prepMinutes: toOptionalNumber(prepMinutes),
                    cookMinutes: toOptionalNumber(cookMinutes),
                    isDraft,
                    language: language ?? undefined,
                    translation: translation && translation.locale !== language ? translation : null,
                    ...(mode === 'create' && captureId ? { captureId } : {}),
                    ...(mode === 'edit' && version ? { baseVersion: version } : {}),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                // Which field, in the page's language (lib/apiMessageDe); the
                // plain sentence when the reason cannot be said.
                const reason = sayable(data.message, '');
                failWith(
                    res.status === 409 && data.conflict
                        ? t('saveConflict')
                        : res.status === 409
                        ? t('slugTaken')
                        : res.status === 400
                          ? reason
                              ? `${t('saveInvalid')} (${reason})`
                              : t('saveInvalid')
                          : t('saveFailed')
                );
                return;
            }

            // Saved: the button stays disabled while the page changes, or a
            // second press creates the recipe twice (or a 409 on its slug).
            saved = true;
            clearDraft();
            router.push(captureId ? '/admin/inbox' : isDraft ? '/admin/drafts' : '/admin');
            router.refresh();
        } catch {
            failWith(t('saveFailed'));
        } finally {
            if (!saved) setSaving(false);
        }
    };

    /** An inbox item's edits kept on the item, without taking it into the cookbook (work #20, #23). */
    const saveToInbox = async () => {
        if (!captureId) return;
        setError('');
        setSaving(true);
        let saved = false;
        try {
            const res = await fetch(`/api/capture/${captureId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draft: {
                        title,
                        description,
                        instructions,
                        category: categories[0] ?? '',
                        nationality: cuisines[0] ?? '',
                        servings: toOptionalNumber(servings),
                        prepMinutes: toOptionalNumber(prepMinutes),
                        cookMinutes: toOptionalNumber(cookMinutes),
                        ingredients: ingredients.filter(named).map((row) => ({ amount: row.amount, item: row.item, linkedRecipeId: row.linkedRecipeId ?? null })),
                    },
                }),
            });
            if (!res.ok) {
                failWith(sayable((await res.json().catch(() => ({}))).message, t('saveFailed')));
                return;
            }
            saved = true;
            clearDraft();
            router.push('/admin/inbox');
            router.refresh();
        } catch {
            failWith(t('saveFailed'));
        } finally {
            if (!saved) setSaving(false);
        }
    };

    return (
        <main className="container mx-auto max-w-3xl px-4 py-10 sm:px-8">
            <h1 className="mb-8 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {mode === 'create' ? t('newRecipe') : t('editRecipe', { title: initial?.title ?? '' })}
            </h1>

            {draftFound && (
                <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-black/[0.03] p-3 text-sm dark:bg-white/[0.05]">
                    <span>{t(draftStale ? 'draftFoundStale' : 'draftFound')}</span>
                    <button type="button" onClick={restoreDraft} className="underline underline-offset-4">
                        {t('restoreDraft')}
                    </button>
                    <button type="button" onClick={clearDraft} className="text-muted underline underline-offset-4">
                        {t('discardDraft')}
                    </button>
                </div>
            )}

            {mode === 'create' && <QuickImport aiEnabled={aiEnabled} onImport={applyImport} />}

            {error && (
                <div
                    ref={errorBox}
                    // Announced as well as scrolled to: somebody using a screen
                    // reader is not helped by the page moving.
                    role="alert"
                    // -mt-2 scroll-mt-24 keeps it clear of the sticky bar when
                    // it is scrolled into view.
                    className="mb-6 scroll-mt-24 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger"
                >
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                <div>
                    <label htmlFor="title" className={labelClass}>{t('title')}</label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        required
                        className={fieldClass}
                    />
                </div>

                <div>
                    <label htmlFor="slug" className={labelClass}>{t('slug')}</label>
                    <div className="flex items-center gap-2">
                        <span className="shrink-0 text-sm text-muted">/recipe/</span>
                        <input
                            id="slug"
                            type="text"
                            value={slug}
                            onChange={(event) => {
                                setSlugTouched(true);
                                setSlug(event.target.value);
                            }}
                            className={fieldClass}
                        />
                        {slugTouched && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSlugTouched(false);
                                    setSlug(slugify(title));
                                }}
                                className="shrink-0 text-sm text-muted underline underline-offset-4"
                            >
                                {t('slugFromTitle')}
                            </button>
                        )}
                    </div>
                </div>

                <div>
                    <label htmlFor="description" className={labelClass}>{t('description')}</label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={3}
                        className={fieldClass}
                    />
                </div>

                <LabelPicker
                    id="categories"
                    label={t('category')}
                    presets={CATEGORY_PRESETS}
                    namespace="Categories"
                    value={categories}
                    onChange={setCategories}
                    known={knownCategories}
                />

                <LabelPicker id="cuisines" label={t('nationality')} presets={CUISINE_PRESETS} namespace="Cuisines" value={cuisines} onChange={setCuisines} />

                <DietPicker
                    tags={tags}
                    onTags={setTags}
                    spiciness={spiciness}
                    onSpiciness={setSpiciness}
                    ingredientNames={ingredients.map((row) => row.item)}
                />

                {/* Free tags only: the named ones (diet, meat, fish) are picked above. */}
                <TagField
                    value={tags.filter((tag) => !KNOWN_TAGS.includes(tag))}
                    onChange={(free) => setTags([...tags.filter((tag) => KNOWN_TAGS.includes(tag)), ...free])}
                />

                <div className="grid gap-6 sm:grid-cols-3">
                    <div>
                        <label htmlFor="servings" className={labelClass}>{t('servings')}</label>
                        <input
                            id="servings"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={100}
                            value={servings}
                            onChange={(event) => setServings(event.target.value)}
                            placeholder="4"
                            className={fieldClass}
                        />
                        <p className="mt-1 text-xs text-muted">{t('servingsHint')}</p>
                    </div>
                    <div>
                        <label htmlFor="prepMinutes" className={labelClass}>{t('prepMinutes')}</label>
                        <input
                            id="prepMinutes"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={prepMinutes}
                            onChange={(event) => setPrepMinutes(event.target.value)}
                            placeholder={t('minutes')}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="cookMinutes" className={labelClass}>{t('cookMinutes')}</label>
                        <input
                            id="cookMinutes"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={cookMinutes}
                            onChange={(event) => setCookMinutes(event.target.value)}
                            placeholder={t('minutes')}
                            className={fieldClass}
                        />
                    </div>
                </div>

                {/* failWith rather than setError: an upload that fails from
                    the drop zone reports itself in the same banner, which is
                    just as far off screen. */}
                <GalleryField
                    imageUrls={imageUrls}
                    title={title}
                    onChange={setImageUrls}
                    ai={aiEnabled ? { title, ingredients: ingredients.map((row) => `${row.amount} ${row.item}`.trim()).filter(Boolean) } : undefined}
                    onError={(message) => (message ? failWith(message) : setError(''))}
                />

                <IngredientEditor
                    ingredients={ingredients}
                    recipeId={initial?.id}
                    onChange={(next) => {
                        const before = ingredients;
                        setIngredients(next);
                        // The amounts are the same in both languages, row for row: the translation's follow at once,
                        // and a row moved, added or removed here is there too (lib/ingredientMatch followedRows).
                        setTranslation((current) => (current ? { ...current, ingredients: followedRows(before, next, current.ingredients, current.locale) ?? current.ingredients } : current));
                    }}
                    language={language}
                    // A row matched to the list: its translation's row takes the list's name in that language.
                    onKnown={(index, names) => setTranslation((current) => (current ? { ...current, ingredients: syncedRows(current.ingredients, ingredients, index, names[current.locale]) } : current))}
                />

                <div>
                    <div className="mb-2 flex items-baseline justify-between gap-4">
                        <label htmlFor="instructions" className={labelClass + ' mb-0'}>
                            {t('instructions')}
                        </label>
                        <button
                            type="button"
                            onClick={() => setPreview((open) => !open)}
                            className="text-sm text-muted underline underline-offset-4"
                        >
                            {preview ? t('backToEdit') : t('preview')}
                        </button>
                    </div>

                    {preview ? (
                        <div className="prose min-h-[12rem] max-w-none rounded-lg border border-line p-4">
                            <ReactMarkdown components={{ img: StorePicture }}>{instructions || t('previewEmpty')}</ReactMarkdown>
                        </div>
                    ) : (
                        <textarea
                            id="instructions"
                            value={instructions}
                            onChange={(event) => setInstructions(event.target.value)}
                            required
                            rows={14}
                            placeholder={t('instructionsPlaceholder')}
                            className={fieldClass + ' font-mono text-sm'}
                        />
                    )}

                    {/* Under the method, because that is where both buttons
                        earn their keep: a title has a typo perhaps twice a
                        year, and a method forwarded from an e-mail is one
                        paragraph every single time. */}
                    {/* With a method, the buttons work on it; without one, the
                        one button writes it from the ingredients (work #30) —
                        never over a method somebody already wrote. */}
                    <PolishPanel
                        text={instructions.trim() ? instructions : ingredients.map((i) => `${i.amount} ${i.item}`.trim()).filter(Boolean).join('\n')}
                        title={title}
                        onApply={setInstructions}
                        modes={instructions.trim() ? ['spelling', 'steps'] : ['generate-method']}
                        disabled={preview}
                        available={aiEnabled}
                    />
                </div>

                <div>
                    <label htmlFor="tips" className={labelClass}>{t('tips')}</label>
                    {preview ? (
                        tips.trim() && (
                            <div className="prose max-w-none rounded-lg border border-line p-4">
                                <ReactMarkdown components={{ img: StorePicture }}>{tips}</ReactMarkdown>
                            </div>
                        )
                    ) : (
                        <textarea
                            id="tips"
                            value={tips}
                            onChange={(event) => setTips(event.target.value)}
                            rows={4}
                            maxLength={10_000}
                            placeholder={t('tipsPlaceholder')}
                            className={fieldClass + ' text-sm'}
                        />
                    )}
                    <p className="mt-1 text-xs text-muted">{t('tipsHint')}</p>
                </div>

                <TranslationPanel
                    original={{ title, description, instructions, tips, ingredients }}
                    language={language}
                    onLanguage={setChosenLanguage}
                    translation={translation}
                    onTranslation={(next) => {
                        if (next) setChosenLanguage(language);
                        const before = translation?.ingredients;
                        setTranslation(next);
                        // An amount changed in the translation's rows is changed in the original's too — only when the
                        // rows were what changed, and row for row (lib/ingredientMatch followedRows).
                        // A translation made again (no row the same) is new words, not new amounts.
                        if (next && before && next.ingredients !== before && next.ingredients.some((row) => before.includes(row))) setIngredients((current) => followedRows(before, next.ingredients, current, language) ?? current);
                    }}
                    available={aiEnabled}
                    onKnown={(index, names, rows) => setIngredients((current) => syncedRows(current, rows, index, names[language]))}
                />

                <div className="flex flex-wrap items-center gap-4">
                    <button
                        type="submit"
                        disabled={saving}
                        className={buttonPrimary}
                    >
                        <BusyLabel busy={saving} busyText={t('saving')}>
                            {mode === 'create' ? t('create') : t('save')}
                        </BusyLabel>
                    </button>
                    {captureId && (
                        <button type="button" disabled={saving} onClick={() => void saveToInbox()} className={buttonSecondary}>
                            {t('saveToInbox')}
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={saving}
                        onClick={(event) => void handleSubmit(event, true)}
                        className={buttonSecondary}
                    >
                        {t('saveAsDraft')}
                    </button>
                    <button
                        type="button"
                        /*
                         * Cancel used to leave the saved draft behind, so the
                         * next time this form opened it offered to restore the
                         * thing that had just been abandoned on purpose. The
                         * form autosaves for the tab that crashes, not for the
                         * edit somebody decided against.
                         */
                        onClick={() => {
                            clearDraft();
                            router.push('/admin');
                        }}
                        className="text-sm text-muted underline underline-offset-4"
                    >
                        {t('cancel')}
                    </button>
                </div>
            </form>
        </main>
    );
}
