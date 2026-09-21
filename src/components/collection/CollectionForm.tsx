'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { buttonPrimary, buttonSecondary } from '@/lib/ui';
import { MAX_RECIPES_PER_COLLECTION } from '@/lib/collectionSchema';

export interface CollectionDraft {
    id?: number;
    title: string;
    description: string;
    recipeIds: number[];
}

/**
 * Making and editing a collection.
 *
 * The hard part of this screen is choosing from a list of recipes that will
 * eventually be long, so it is a search box and a list rather than a
 * multi-select: nobody scrolls a two-hundred-item `<select multiple>`, and a
 * picker that needs scrolling is a picker that gets used once.
 *
 * Order is up and down buttons, not dragging. Dragging is the nicer gesture on
 * a laptop and an unreliable one on a phone, where this will mostly be used —
 * and the list is six things long, so two taps is not a hardship.
 */
export default function CollectionForm({
    initial,
    recipes,
}: {
    initial: CollectionDraft;
    /** Every recipe, by name. Small enough to filter in the browser. */
    recipes: { id: number; title: string }[];
}) {
    const t = useTranslations('Collections');
    const router = useRouter();

    const [title, setTitle] = useState(initial.title);
    const [description, setDescription] = useState(initial.description);
    const [chosen, setChosen] = useState<number[]>(initial.recipeIds);
    const [search, setSearch] = useState('');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const byId = useMemo(
        () => new Map(recipes.map((recipe) => [recipe.id, recipe.title])),
        [recipes]
    );

    // What is left to add, narrowed by what has been typed. Filtered here
    // rather than on the server: the whole list is already on the page, and a
    // round trip per keystroke to search a list you are holding is silly.
    const available = useMemo(() => {
        const taken = new Set(chosen);
        const needle = search.trim().toLowerCase();

        return recipes
            .filter((recipe) => !taken.has(recipe.id))
            .filter((recipe) => needle === '' || recipe.title.toLowerCase().includes(needle))
            .slice(0, 30);
    }, [recipes, chosen, search]);

    const move = (index: number, by: number) => {
        const next = [...chosen];
        const target = index + by;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setChosen(next);
    };

    const save = async () => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(
                initial.id ? `/api/collections/${initial.id}` : '/api/collections',
                {
                    method: initial.id ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        description: description.trim() || null,
                        recipeIds: chosen,
                    }),
                }
            );

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setError(data?.message || t('saveFailed'));
                return;
            }

            router.push(`/collections/${data.slug}`);
            router.refresh();
        } catch {
            setError(t('saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!initial.id) return;

        setBusy(true);
        setError('');

        try {
            const res = await fetch(`/api/collections/${initial.id}`, { method: 'DELETE' });
            if (!res.ok) {
                setError(t('saveFailed'));
                return;
            }
            router.push('/collections');
            router.refresh();
        } catch {
            setError(t('saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    const fieldClass =
        'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
    const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
            className="flex flex-col gap-8"
        >
            {error && (
                <p role="alert" className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            <div>
                <label htmlFor="collection-title" className={labelClass}>{t('fieldTitle')}</label>
                <input
                    id="collection-title"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={80}
                    className={fieldClass}
                />
            </div>

            <div>
                <label htmlFor="collection-description" className={labelClass}>
                    {t('fieldDescription')}
                </label>
                <input
                    id="collection-description"
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={200}
                    className={fieldClass}
                />
            </div>

            <div>
                <h2 className={labelClass}>{t('pick')}</h2>

                {chosen.length === 0 ? (
                    <p className="text-sm text-muted">{t('empty')}</p>
                ) : (
                    <ol className="divide-y divide-line">
                        {chosen.map((id, index) => (
                            <li key={id} className="flex items-center gap-3 py-2">
                                <span className="w-6 shrink-0 text-sm tabular-nums text-faint">
                                    {index + 1}
                                </span>

                                <span className="min-w-0 flex-1 truncate">{byId.get(id) ?? id}</span>

                                <button
                                    type="button"
                                    onClick={() => move(index, -1)}
                                    disabled={index === 0}
                                    aria-label={t('moveUp')}
                                    className="flex h-11 w-11 items-center justify-center text-faint disabled:opacity-30"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(index, 1)}
                                    disabled={index === chosen.length - 1}
                                    aria-label={t('moveDown')}
                                    className="flex h-11 w-11 items-center justify-center text-faint disabled:opacity-30"
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChosen(chosen.filter((entry) => entry !== id))}
                                    aria-label={t('remove')}
                                    className="flex h-11 w-11 items-center justify-center text-faint hover:text-danger"
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            {chosen.length < MAX_RECIPES_PER_COLLECTION && (
                <div>
                    <label htmlFor="collection-search" className={labelClass}>{t('add')}</label>
                    <input
                        id="collection-search"
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className={fieldClass}
                    />

                    <ul className="mt-3 flex flex-wrap gap-2">
                        {available.map((recipe) => (
                            <li key={recipe.id}>
                                <button
                                    type="button"
                                    onClick={() => setChosen([...chosen, recipe.id])}
                                    className={buttonSecondary}
                                >
                                    {recipe.title}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-6">
                <button type="submit" disabled={busy || !title.trim()} className={buttonPrimary}>
                    {busy ? t('saving') : t('save')}
                </button>

                {initial.id && (
                    <InlineConfirm
                        label={t('delete')}
                        question={t('confirmDelete')}
                        confirmLabel={t('delete')}
                        destructive
                        disabled={busy}
                        onConfirm={remove}
                        className="text-sm text-muted underline underline-offset-4 hover:text-danger"
                    />
                )}
            </div>
        </form>
    );
}
