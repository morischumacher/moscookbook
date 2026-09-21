'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { slugify } from '@/lib/recipe';
import { useLocalDraft } from '@/lib/useLocalDraft';
import { buttonPrimary } from '@/lib/ui';

const fieldClass =
    'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

export interface PostDraft {
    id?: number;
    title: string;
    slug: string;
    body: string;
    imageUrl: string;
    recipeId: number | null;
    published: boolean;
}

/**
 * Writing an entry.
 *
 * A title, a Markdown box, an optional picture and an optional recipe. There is
 * no AI here and no import: this is the one part of the cookbook where the
 * words are supposed to be the author's, and a machine offering to write them
 * would be answering a question nobody asked.
 *
 * Saving as a draft and publishing are two buttons rather than a checkbox, so
 * that neither can happen by accident. Which one a person means is a decision,
 * not a setting they toggled three fields ago and forgot.
 *
 * What is typed here is kept in the browser as it is typed. This is the one
 * part of the cookbook where the words are the author's own, and it was the one
 * form with no protection at all — a long entry written on a phone was gone the
 * moment a call came in and Safari discarded the tab, while the recipe form
 * beside it recovered. The draft is offered back rather than restored on its
 * own: something reappearing by itself is indistinguishable from the form
 * having saved what you did not mean to save.
 */
export default function PostForm({
    initial,
    recipes,
}: {
    initial: PostDraft;
    /** Every recipe, so an entry can be attached to one. Small list, one query. */
    recipes: { id: number; title: string }[];
}) {
    const t = useTranslations('Blog');
    const router = useRouter();

    const [title, setTitle] = useState(initial.title);
    const [slug, setSlug] = useState(initial.slug);
    const [slugTouched, setSlugTouched] = useState(initial.slug !== '');
    const [body, setBody] = useState(initial.body);
    const [imageUrl, setImageUrl] = useState(initial.imageUrl);
    const [recipeId, setRecipeId] = useState<number | null>(initial.recipeId);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Keyed by the entry being edited, so a draft of one never turns up in
    // another, and a new entry has a key of its own.
    const draftKey = `post-draft-${initial.id ?? 'new'}`;

    const values = useMemo(
        () => ({ title, slug, body, imageUrl, recipeId }),
        [title, slug, body, imageUrl, recipeId]
    );

    // A title or a body. A picture on its own is not an entry anybody would
    // mourn, and saving over a real draft with an empty form is the one way
    // this could destroy rather than protect.
    const draft = useLocalDraft(draftKey, values, Boolean(title.trim() || body.trim()));

    const restoreDraft = () => {
        const saved = draft.read();
        if (!saved) return;

        setTitle(saved.title ?? '');
        setSlug(saved.slug ?? '');
        setSlugTouched(Boolean(saved.slug));
        setBody(saved.body ?? '');
        setImageUrl(saved.imageUrl ?? '');
        setRecipeId(saved.recipeId ?? null);
        draft.clear();
    };

    const save = async (published: boolean) => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(
                initial.id ? `/api/posts/${initial.id}` : '/api/posts',
                {
                    method: initial.id ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        slug: slug || slugify(title),
                        body,
                        imageUrl,
                        recipeId,
                        published,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || t('saveFailed'));
                return;
            }

            // Saved, so there is nothing left to recover.
            draft.clear();

            router.push('/admin/posts');
            router.refresh();
        } catch {
            setError(t('saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                // Enter in a field means "save what I have", never "publish".
                void save(initial.published);
            }}
            className="flex flex-col gap-6"
        >
            {error && (
                <p className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {draft.found && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
                    <p className="text-sm text-muted">{t('draftFound')}</p>
                    <div className="flex gap-4 text-sm">
                        <button
                            type="button"
                            onClick={restoreDraft}
                            className="font-medium underline underline-offset-4"
                        >
                            {t('draftRestore')}
                        </button>
                        <button
                            type="button"
                            onClick={draft.clear}
                            className="text-muted underline underline-offset-4 hover:text-ink"
                        >
                            {t('draftDiscard')}
                        </button>
                    </div>
                </div>
            )}

            <div>
                <label htmlFor="title" className={labelClass}>{t('fieldTitle')}</label>
                <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(event) => {
                        setTitle(event.target.value);
                        // The address follows the title until somebody edits it
                        // by hand, after which it is theirs and stays put.
                        if (!slugTouched) setSlug(slugify(event.target.value));
                    }}
                    required
                    className={fieldClass}
                />
            </div>

            <div>
                <label htmlFor="body" className={labelClass}>{t('fieldBody')}</label>
                <textarea
                    id="body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    required
                    rows={16}
                    className={`${fieldClass} font-mono text-base leading-relaxed`}
                />
                <p className="mt-2 text-sm text-muted">{t('markdownHint')}</p>
            </div>

            <div>
                <label htmlFor="recipeId" className={labelClass}>{t('fieldRecipe')}</label>
                <select
                    id="recipeId"
                    value={recipeId ?? ''}
                    onChange={(event) =>
                        setRecipeId(event.target.value === '' ? null : Number(event.target.value))
                    }
                    className={fieldClass}
                >
                    {/* First and selected by default: an entry never needs a
                        recipe, and the empty option is what says so. */}
                    <option value="">{t('noRecipe')}</option>
                    {recipes.map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                            {recipe.title}
                        </option>
                    ))}
                </select>
                <p className="mt-2 text-sm text-muted">{t('recipeHint')}</p>
            </div>

            <div>
                <label htmlFor="imageUrl" className={labelClass}>{t('fieldImage')}</label>
                <input
                    type="url"
                    id="imageUrl"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="https://…"
                    className={fieldClass}
                />
            </div>

            <div>
                <label htmlFor="slug" className={labelClass}>{t('fieldSlug')}</label>
                <input
                    type="text"
                    id="slug"
                    value={slug}
                    onChange={(event) => {
                        setSlugTouched(true);
                        setSlug(event.target.value);
                    }}
                    className={`${fieldClass} font-mono text-base`}
                />
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
                <button
                    type="button"
                    onClick={() => void save(true)}
                    disabled={busy}
                    className={buttonPrimary}
                >
                    {initial.published ? t('savePublished') : t('publish')}
                </button>

                <button
                    type="button"
                    onClick={() => void save(false)}
                    disabled={busy}
                    className="rounded-full border border-line px-6 py-3 font-medium disabled:opacity-50"
                >
                    {t('saveDraft')}
                </button>
            </div>
        </form>
    );
}
