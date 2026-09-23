'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import ReactMarkdown from 'react-markdown';
import { slugify, type Ingredient } from '@/lib/recipe';
import PolishPanel from './PolishPanel';
import TranslationPanel from './TranslationPanel';
import { guessLanguage, type RecipeLanguage, type RecipeTranslationInput } from '@/lib/recipeTranslation';
import GalleryField from './GalleryField';
import TagField from './TagField';
import IngredientEditor, { EMPTY_ROW } from './IngredientEditor';
import { fieldClass, labelClass } from './formStyles';
import QuickImport, { type ImportedDraft } from './QuickImport';
import { buttonPrimary } from '@/lib/ui';
import { BusyLabel } from '@/components/ui/Busy';
import LabelPicker from './LabelPicker';
import DietPicker from './DietPicker';
import { CATEGORY_PRESETS, CUISINE_PRESETS } from '@/lib/recipeLabels';
import { KNOWN_TAGS } from '@/lib/tags';

export interface RecipeFormValues {
    id?: number;
    title: string;
    slug: string;
    description: string;
    category: string;
    nationality: string;
    instructions: string;
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
    /** Only the admins see it. See lib/recipeVisibility. */
    onlyMe?: boolean;
}

/** A list from the lists if there are any, else from the single field. */
const listOf = (list: string[] | undefined, single: string | undefined) =>
    list && list.length > 0 ? list : single ? [single] : [];


export default function RecipeForm({
    mode,
    initial,
    aiEnabled,
    captureId,
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
    const [onlyMe, setOnlyMe] = useState(initial?.onlyMe ?? false);
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
            if (window.localStorage.getItem(draftKey)) setDraftFound(true);
        } catch {
            // Private mode or blocked storage — drafts are a convenience, not a requirement.
        }
    }, [draftKey]);

    const values = useMemo(
        () => ({
            title, slug, description, categories, cuisines, spiciness, imageUrls, instructions,
            ingredients, servings, prepMinutes, cookMinutes, tags,
            // The translation too: it was a paid call and possibly corrected by hand.
            language: chosenLanguage, translation,
        }),
        [
            title, slug, description, categories, cuisines, spiciness, imageUrls, instructions,
            ingredients, servings, prepMinutes, cookMinutes, tags, chosenLanguage, translation,
        ]
    );

    useEffect(() => {
        const isEmpty = !title && !instructions && ingredients.every((row) => !row.item);
        // Not while an interrupted draft is waiting to be restored or thrown
        // away: saving now would overwrite it with the page as it loaded.
        if (isEmpty || draftFound) return;

        const timer = setTimeout(() => {
            try {
                window.localStorage.setItem(draftKey, JSON.stringify(values));
            } catch {
                /* ignore */
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [values, draftKey, title, instructions, ingredients, draftFound]);

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
        if (draft.ingredients.length > 0) setIngredients(draft.ingredients);
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

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        const cleanedIngredients = ingredients.filter((row) => row.item.trim() !== '');

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
                    ingredients: cleanedIngredients,
                    servings: toOptionalNumber(servings),
                    prepMinutes: toOptionalNumber(prepMinutes),
                    cookMinutes: toOptionalNumber(cookMinutes),
                    language,
                    onlyMe,
                    translation: translation && translation.locale !== language ? translation : null,
                    ...(mode === 'create' && captureId ? { captureId } : {}),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                // The server says it in English; the reason is said here.
                failWith(
                    res.status === 409
                        ? t('slugTaken')
                        : res.status === 400 && data.message
                          ? `${t('saveInvalid')} (${data.message})`
                          : t('saveFailed')
                );
                return;
            }

            // Saved: the button stays disabled while the page changes, or a
            // second press creates the recipe twice (or a 409 on its slug).
            saved = true;
            clearDraft();
            router.push(captureId ? '/admin/inbox' : '/admin');
            router.refresh();
        } catch {
            failWith(t('saveFailed'));
        } finally {
            if (!saved) setSaving(false);
        }
    };

    return (
        <div className="container mx-auto max-w-3xl px-4 py-10 sm:px-8">
            <h1 className="mb-8 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {mode === 'create' ? t('newRecipe') : t('editRecipe', { title: initial?.title ?? '' })}
            </h1>

            {draftFound && (
                <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-black/[0.03] p-3 text-sm dark:bg-white/[0.05]">
                    <span>{t('draftFound')}</span>
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
                    onChange={setImageUrls}
                    onError={(message) => (message ? failWith(message) : setError(''))}
                />

                <IngredientEditor ingredients={ingredients} onChange={setIngredients} />

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
                            <ReactMarkdown>{instructions || t('previewEmpty')}</ReactMarkdown>
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
                    <PolishPanel
                        text={instructions}
                        onApply={setInstructions}
                        disabled={preview}
                        available={aiEnabled}
                    />
                </div>

                <TranslationPanel
                    original={{ title, description, instructions, ingredients }}
                    language={language}
                    onLanguage={setChosenLanguage}
                    translation={translation}
                    onTranslation={(next) => {
                        if (next) setChosenLanguage(language);
                        setTranslation(next);
                    }}
                    available={aiEnabled}
                />

                {/* Who may see it, beyond the three stages the share button
                    offers: a finished recipe that is nobody else's business. */}
                <label className="flex items-start gap-3 rounded-xl border border-line p-4">
                    <input
                        type="checkbox"
                        checked={onlyMe}
                        onChange={(event) => setOnlyMe(event.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span>
                        <span className="block font-bold">{t('onlyMe')}</span>
                        <span className="block text-sm text-muted">{t('onlyMeHint')}</span>
                    </span>
                </label>

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
        </div>
    );
}
