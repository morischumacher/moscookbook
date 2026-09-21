'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { slugify } from '@/lib/recipe';

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
                    className="rounded-full bg-ink px-6 py-3 font-medium text-page disabled:opacity-50"
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
