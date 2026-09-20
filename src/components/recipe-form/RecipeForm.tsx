'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { slugify, type Ingredient } from '@/lib/recipe';
import { parseIngredientLine } from '@/lib/recipeParser';
import { compressImage } from '@/lib/imageCompression';
import QuickImport, { type ImportedDraft } from './QuickImport';

export interface RecipeFormValues {
    id?: number;
    title: string;
    slug: string;
    description: string;
    category: string;
    nationality: string;
    instructions: string;
    ingredients: Ingredient[];
    imageUrl: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
}

const EMPTY_ROW: Ingredient = { amount: '', item: '' };

const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Drink'];
const NATIONALITIES = ['German', 'Italian', 'Asian', 'Mexican', 'French', 'Greek', 'Indian'];

const fieldClass =
    'w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-ink transition-colors';
const labelClass = 'block text-sm font-bold uppercase tracking-widest text-muted mb-2';

/* ------------------------------------------------------------------ image */

function ImageField({
    imageUrl,
    onChange,
    onError,
}: {
    imageUrl: string;
    onChange: (url: string) => void;
    onError: (message: string) => void;
}) {
    const t = useTranslations('RecipeForm');
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const upload = useCallback(
        async (file: File) => {
            setUploading(true);
            onError('');
            try {
                const prepared = await compressImage(file);
                const formData = new FormData();
                formData.append('file', prepared);

                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();

                if (!res.ok || !data.url) {
                    onError(data.error || t('uploadFailed'));
                    return;
                }
                onChange(data.url);
            } catch {
                onError(t('uploadFailed'));
            } finally {
                setUploading(false);
            }
        },
        [onChange, onError, t]
    );

    // Pasting a screenshot straight into the page is the fastest path of all.
    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const file = Array.from(event.clipboardData?.files ?? [])[0];
            if (file?.type.startsWith('image/')) {
                event.preventDefault();
                upload(file);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [upload]);

    return (
        <div>
            <label className={labelClass}>{t('image')}</label>

            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) upload(file);
                }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors ${dragging
                    ? 'border-ink bg-surface'
                    : 'border-line'
                    }`}
            >
                {imageUrl ? (
                    <div className="relative mx-auto aspect-[16/9] w-full max-w-md overflow-hidden rounded-lg">
                        <Image src={imageUrl} alt={t('imagePreview')} fill className="object-cover" sizes="400px" />
                    </div>
                ) : (
                    <p className="py-6 text-sm text-muted">
                        {uploading
                            ? t('imageUploading')
                            : t('imageDropHint')}
                    </p>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload(file);
                        event.target.value = '';
                    }}
                />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                {/* On a phone this opens the camera directly. */}
                <label className="cursor-pointer text-muted underline underline-offset-2">
                    {t('takePhoto')}
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) upload(file);
                            event.target.value = '';
                        }}
                    />
                </label>
                {imageUrl && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="text-muted underline underline-offset-2"
                    >
                        {t('removeImage')}
                    </button>
                )}
                {uploading && <span className="text-muted">{t('imageUploading')}</span>}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------ ingredients */

function IngredientEditor({
    ingredients,
    onChange,
}: {
    ingredients: Ingredient[];
    onChange: (next: Ingredient[]) => void;
}) {
    const t = useTranslations('RecipeForm');
    const [bulk, setBulk] = useState('');
    const [showBulk, setShowBulk] = useState(false);
    const itemRefs = useRef<(HTMLInputElement | null)[]>([]);

    const update = (index: number, field: keyof Ingredient, value: string) => {
        const next = ingredients.map((row, position) =>
            position === index ? { ...row, [field]: value } : row
        );
        onChange(next);
    };

    const addRow = (afterIndex?: number) => {
        const next = [...ingredients];
        const position = afterIndex === undefined ? next.length : afterIndex + 1;
        next.splice(position, 0, { ...EMPTY_ROW });
        onChange(next);
        // Focus the new row so a whole list can be typed without the mouse.
        requestAnimationFrame(() => itemRefs.current[position]?.focus());
    };

    const removeRow = (index: number) => {
        const next = ingredients.filter((_, position) => position !== index);
        onChange(next.length > 0 ? next : [{ ...EMPTY_ROW }]);
    };

    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= ingredients.length) return;
        const next = [...ingredients];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    const applyBulk = () => {
        const parsed = bulk
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map(parseIngredientLine)
            .filter((row) => row.item !== '');

        if (parsed.length === 0) return;

        const existing = ingredients.filter((row) => row.item.trim() !== '');
        onChange([...existing, ...parsed]);
        setBulk('');
        setShowBulk(false);
    };

    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
                <label className={labelClass + ' mb-0'}>{t('ingredients')}</label>
                <button
                    type="button"
                    onClick={() => setShowBulk((open) => !open)}
                    className="text-sm text-muted underline underline-offset-2"
                >
                    {showBulk ? t('closeList') : t('pasteList')}
                </button>
            </div>

            {showBulk && (
                <div className="mb-4 flex flex-col gap-2">
                    <textarea
                        value={bulk}
                        onChange={(event) => setBulk(event.target.value)}
                        rows={6}
                        placeholder={t('bulkPlaceholder')}
                        className={fieldClass + ' font-mono text-sm'}
                    />
                    <button
                        type="button"
                        onClick={applyBulk}
                        className="self-start rounded-full border border-line px-4 py-1.5 text-sm hover:border-ink"
                    >
                        {t('appendIngredients')}
                    </button>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {ingredients.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={row.amount}
                            onChange={(event) => update(index, 'amount', event.target.value)}
                            placeholder={t('amountPlaceholder')}
                            aria-label={t('amountLabel', { number: index + 1 })}
                            className={fieldClass + ' w-24 shrink-0 sm:w-32'}
                        />
                        <input
                            ref={(element) => {
                                itemRefs.current[index] = element;
                            }}
                            type="text"
                            value={row.item}
                            onChange={(event) => update(index, 'item', event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addRow(index);
                                }
                            }}
                            placeholder={t('itemPlaceholder')}
                            aria-label={t('itemLabel', { number: index + 1 })}
                            className={fieldClass + ' flex-1'}
                        />
                        <div className="flex shrink-0 items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => move(index, -1)}
                                aria-label={t('moveUp')}
                                className="flex h-10 w-8 items-center justify-center text-faint hover:text-ink"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                onClick={() => move(index, 1)}
                                aria-label={t('moveDown')}
                                className="flex h-10 w-8 items-center justify-center text-faint hover:text-ink"
                            >
                                ↓
                            </button>
                            <button
                                type="button"
                                onClick={() => removeRow(index)}
                                aria-label={t('removeIngredient')}
                                className="flex h-10 w-8 items-center justify-center text-faint hover:text-danger"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={() => addRow()}
                className="mt-3 rounded-full border border-line px-4 py-1.5 text-sm hover:border-ink"
            >
                {t('addIngredient')}
            </button>
            <p className="mt-2 text-xs text-muted">
                {t('enterHint')}
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------- form */

export default function RecipeForm({
    mode,
    initial,
    aiEnabled,
}: {
    mode: 'create' | 'edit';
    initial?: Partial<RecipeFormValues>;
    aiEnabled: boolean;
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
    const [category, setCategory] = useState(initial?.category ?? '');
    const [nationality, setNationality] = useState(initial?.nationality ?? '');
    const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
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

    const [preview, setPreview] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [draftFound, setDraftFound] = useState(false);

    const draftKey = mode === 'create' ? 'moscookbook:draft:new' : `moscookbook:draft:${initial?.id}`;

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
            title, slug, description, category, nationality, imageUrl, instructions,
            ingredients, servings, prepMinutes, cookMinutes,
        }),
        [
            title, slug, description, category, nationality, imageUrl, instructions,
            ingredients, servings, prepMinutes, cookMinutes,
        ]
    );

    useEffect(() => {
        const isEmpty = !title && !instructions && ingredients.every((row) => !row.item);
        if (isEmpty) return;

        const timer = setTimeout(() => {
            try {
                window.localStorage.setItem(draftKey, JSON.stringify(values));
            } catch {
                /* ignore */
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [values, draftKey, title, instructions, ingredients]);

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
            setCategory(draft.category ?? '');
            setNationality(draft.nationality ?? '');
            setImageUrl(draft.imageUrl ?? '');
            setInstructions(draft.instructions ?? '');
            setIngredients(
                draft.ingredients && draft.ingredients.length > 0 ? draft.ingredients : [{ ...EMPTY_ROW }]
            );
            setServings(draft.servings != null ? String(draft.servings) : '');
            setPrepMinutes(draft.prepMinutes != null ? String(draft.prepMinutes) : '');
            setCookMinutes(draft.cookMinutes != null ? String(draft.cookMinutes) : '');
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
        if (draft.category) setCategory(draft.category);
        if (draft.nationality) setNationality(draft.nationality);
        if (draft.instructions) setInstructions(draft.instructions);
        if (draft.imageUrl) setImageUrl(draft.imageUrl);
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

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        const cleanedIngredients = ingredients.filter((row) => row.item.trim() !== '');

        if (!title.trim() || !instructions.trim()) {
            setError(t('requiredFields'));
            return;
        }

        setSaving(true);
        try {
            const endpoint = mode === 'create' ? '/api/recipes' : `/api/recipes/${initial?.id}`;
            const res = await fetch(endpoint, {
                method: mode === 'create' ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    slug: slug || slugify(title),
                    description,
                    category,
                    nationality,
                    imageUrl,
                    instructions,
                    ingredients: cleanedIngredients,
                    servings: toOptionalNumber(servings),
                    prepMinutes: toOptionalNumber(prepMinutes),
                    cookMinutes: toOptionalNumber(cookMinutes),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message || t('saveFailed'));
                return;
            }

            clearDraft();
            router.push('/admin');
            router.refresh();
        } catch {
            setError(t('saveFailed'));
        } finally {
            setSaving(false);
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
                    <button type="button" onClick={restoreDraft} className="underline underline-offset-2">
                        {t('restoreDraft')}
                    </button>
                    <button type="button" onClick={clearDraft} className="text-muted underline underline-offset-2">
                        {t('discardDraft')}
                    </button>
                </div>
            )}

            {mode === 'create' && <QuickImport aiEnabled={aiEnabled} onImport={applyImport} />}

            {error && (
                <p className="mb-6 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
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
                                className="shrink-0 text-sm text-muted underline underline-offset-2"
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

                <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                        <label htmlFor="category" className={labelClass}>{t('category')}</label>
                        <input
                            id="category"
                            type="text"
                            value={category}
                            onChange={(event) => setCategory(event.target.value)}
                            list="categories"
                            className={fieldClass}
                        />
                        <datalist id="categories">
                            {CATEGORIES.map((entry) => (
                                <option key={entry} value={entry} />
                            ))}
                        </datalist>
                    </div>

                    <div>
                        <label htmlFor="nationality" className={labelClass}>{t('nationality')}</label>
                        <input
                            id="nationality"
                            type="text"
                            value={nationality}
                            onChange={(event) => setNationality(event.target.value)}
                            list="nationalities"
                            className={fieldClass}
                        />
                        <datalist id="nationalities">
                            {NATIONALITIES.map((entry) => (
                                <option key={entry} value={entry} />
                            ))}
                        </datalist>
                    </div>
                </div>

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
                        <p className="mt-1 text-xs text-muted">
                            Schaltet den Portionsrechner frei.
                        </p>
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

                <ImageField imageUrl={imageUrl} onChange={setImageUrl} onError={setError} />

                <IngredientEditor ingredients={ingredients} onChange={setIngredients} />

                <div>
                    <div className="mb-2 flex items-baseline justify-between gap-4">
                        <label htmlFor="instructions" className={labelClass + ' mb-0'}>
                            {t('instructions')}
                        </label>
                        <button
                            type="button"
                            onClick={() => setPreview((open) => !open)}
                            className="text-sm text-muted underline underline-offset-2"
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
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded-full bg-ink px-6 py-3 font-medium text-page disabled:opacity-50"
                    >
                        {saving ? t('saving') : mode === 'create' ? t('create') : t('save')}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push('/admin')}
                        className="text-sm text-muted underline underline-offset-2"
                    >
                        {t('cancel')}
                    </button>
                </div>
            </form>
        </div>
    );
}
