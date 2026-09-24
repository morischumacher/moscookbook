'use client';

import { useMemo, useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { slugify } from '@/lib/recipe';
import { useLocalDraft } from '@/lib/useLocalDraft';
import { buttonPrimary, buttonSecondary } from '@/lib/ui';
import { BusyLabel } from '@/components/ui/Busy';
import MarkdownEditor from '@/components/ui/MarkdownEditor';
import PictureField from '@/components/ui/PictureField';
import PickList, { type PickOption } from '@/components/ui/PickList';
import InlineConfirm from '@/components/ui/InlineConfirm';

const fieldClass =
    'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

export interface PostDraft {
    id?: number;
    title: string;
    slug: string;
    body: string;
    imageUrl: string;
    recipeIds: number[];
    collectionIds: number[];
    published: boolean;
}

/**
 * Writing an entry.
 *
 * A title, the text (with pictures in it, if wanted), an optional cover
 * picture, and the recipes and collections it is about. There is
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
    collections,
}: {
    initial: PostDraft;
    /** Every finished recipe, so an entry can be about some of them. */
    recipes: PickOption[];
    collections: PickOption[];
}) {
    const t = useTranslations('Blog');
    const router = useRouter();

    const [title, setTitle] = useState(initial.title);
    const [slug, setSlug] = useState(initial.slug);
    const [slugTouched, setSlugTouched] = useState(initial.slug !== '');
    const [body, setBody] = useState(initial.body);
    const [imageUrl, setImageUrl] = useState(initial.imageUrl);
    const [recipeIds, setRecipeIds] = useState<number[]>(initial.recipeIds);
    const [collectionIds, setCollectionIds] = useState<number[]>(initial.collectionIds);

    const [busy, setBusy] = useState<null | 'publish' | 'draft'>(null);
    const [error, setError] = useState('');

    // Keyed by the entry being edited, so a draft of one never turns up in
    // another, and a new entry has a key of its own.
    const draftKey = `post-draft-${initial.id ?? 'new'}`;

    const values = useMemo(
        () => ({ title, slug, body, imageUrl, recipeIds, collectionIds }),
        [title, slug, body, imageUrl, recipeIds, collectionIds]
    );

    // A title or a body. A picture on its own is not an entry anybody would
    // mourn, and saving over a real draft with an empty form is the one way
    // this could destroy rather than protect.
    const draft = useLocalDraft(draftKey, values, Boolean(title.trim() || body.trim()));

    const restoreDraft = () => {
        const saved = draft.read() as (Partial<typeof values> & { recipeId?: number | null }) | null;
        if (!saved) return;

        setTitle(saved.title ?? '');
        setSlug(saved.slug ?? '');
        setSlugTouched(Boolean(saved.slug));
        setBody(saved.body ?? '');
        setImageUrl(saved.imageUrl ?? '');
        // A draft kept before an entry could be about several recipes.
        setRecipeIds(saved.recipeIds ?? (saved.recipeId ? [saved.recipeId] : []));
        setCollectionIds(saved.collectionIds ?? []);
        draft.clear();
    };

    const save = async (published: boolean) => {
        let left = false;
        setBusy(published ? 'publish' : 'draft');
        setError('');

        try {
            const res = await fetch(
                initial.id ? `/api/posts/${initial.id}` : '/api/posts',
                {
                    method: initial.id ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        // Editing, an emptied field keeps the address it has (the
                        // server's fallback): a title turned into a new one moved
                        // a published entry to another link.
                        slug: initial.id ? slug : slug || slugify(title),
                        body,
                        imageUrl,
                        recipeIds,
                        collectionIds,
                        published,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                setError(sayable(data?.message, t('saveFailed')));
                return;
            }

            // Saved, so there is nothing left to recover.
            draft.clear();
            // Saved: the button stays disabled while the page changes. Freed in
            // `finally`, a second press in that moment saved a copy ("…-2").
            left = true;
            router.push('/admin/posts');
            router.refresh();
        } catch {
            setError(t('saveFailed'));
        } finally {
            if (!left) setBusy(null);
        }
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                // Enter in a field means "save what I have", never "publish".
                void save(initial.published);
            }}
            className="flex flex-col gap-8"
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

            <MarkdownEditor id="body" label={t('fieldBody')} value={body} onChange={setBody} rows={16} />

            <PictureField
                id="imageUrl"
                label={t('fieldImage')}
                hint={t('imageHint')}
                value={imageUrl}
                onChange={setImageUrl}
            />

            <PickList
                label={t('fieldRecipes')}
                hint={t('recipesHint')}
                options={recipes}
                value={recipeIds}
                onChange={setRecipeIds}
            />

            <PickList
                label={t('fieldCollections')}
                hint={t('collectionsHint')}
                options={collections}
                value={collectionIds}
                onChange={setCollectionIds}
            />

            {/* The address is set once and rarely thought about again, so it
                is out of the way — but visible, with what it is for, because
                "Address" on its own was read as a street. */}
            <details className="rounded-lg border border-line px-4 py-3" open={slugTouched && initial.slug !== slug}>
                <summary className="cursor-pointer text-sm font-medium">
                    {t('fieldSlug')} <span className="font-mono text-muted">/blog/{slug || slugify(title) || '…'}</span>
                </summary>
                <div className="mt-3">
                    <label htmlFor="slug" className="sr-only">{t('fieldSlug')}</label>
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
                    <p className="mt-2 text-sm text-muted">{t('slugHint')}</p>
                </div>
            </details>

            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
                <button
                    type="button"
                    onClick={() => void save(true)}
                    disabled={busy !== null}
                    className={buttonPrimary}
                >
                    <BusyLabel busy={busy === 'publish'}>
                        {initial.published ? t('savePublished') : t('publish')}
                    </BusyLabel>
                </button>

                {initial.published ? (
                    // On a published entry this takes it offline, with its
                    // link: said so, and asked first — it was one tap.
                    <InlineConfirm
                        label={t('unpublish')}
                        question={t('unpublishQuestion')}
                        confirmLabel={t('unpublish')}
                        destructive
                        disabled={busy !== null}
                        onConfirm={() => save(false)}
                        className={buttonSecondary}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => void save(false)}
                        disabled={busy !== null}
                        className={buttonSecondary}
                    >
                        <BusyLabel busy={busy === 'draft'}>{t('saveDraft')}</BusyLabel>
                    </button>
                )}
            </div>
        </form>
    );
}
