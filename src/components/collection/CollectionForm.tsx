'use client';

import { useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { buttonPrimary } from '@/lib/ui';
import { MAX_RECIPES_PER_COLLECTION } from '@/lib/collectionSchema';
import { BusyLabel } from '@/components/ui/Busy';
import MarkdownEditor from '@/components/ui/MarkdownEditor';
import PictureField from '@/components/ui/PictureField';
import PickList, { type PickOption } from '@/components/ui/PickList';

export interface CollectionDraft {
    id?: number;
    title: string;
    description: string;
    imageUrl: string;
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
    recipes: PickOption[];
}) {
    const t = useTranslations('Collections');
    const router = useRouter();

    const [title, setTitle] = useState(initial.title);
    const [description, setDescription] = useState(initial.description);
    const [imageUrl, setImageUrl] = useState(initial.imageUrl);
    const [chosen, setChosen] = useState<number[]>(initial.recipeIds);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const save = async () => {
        let left = false;
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
                        imageUrl,
                        recipeIds: chosen,
                    }),
                }
            );

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setError(sayable(data?.message, t('saveFailed')));
                return;
            }

            // Saved: the button stays disabled while the page changes. Freed in
            // `finally`, a second press in that moment saved a copy ("…-2").
            left = true;
            router.push(`/collections/${data.slug}`);
            router.refresh();
        } catch {
            setError(t('saveFailed'));
        } finally {
            if (!left) setBusy(false);
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
            router.push('/admin/collections');
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

            {/* As long as it needs to be, with formatting and pictures: a
                collection is often introduced — the occasion, what to make
                first — and "one line about it" was not room for that. */}
            <MarkdownEditor
                id="collection-description"
                label={t('fieldDescription')}
                value={description}
                onChange={setDescription}
                rows={6}
            />

            <PictureField
                id="collection-image"
                label={t('fieldImage')}
                hint={t('imageHint')}
                value={imageUrl}
                onChange={setImageUrl}
            />

            <PickList
                label={t('pick')}
                hint={t('pickHint', { max: MAX_RECIPES_PER_COLLECTION })}
                options={recipes}
                value={chosen}
                onChange={(ids) => setChosen(ids.slice(0, MAX_RECIPES_PER_COLLECTION))}
            />

            <div className="flex flex-wrap items-center gap-6 border-t border-line pt-6">
                <button type="submit" disabled={busy || !title.trim()} className={buttonPrimary}>
                    <BusyLabel busy={busy} busyText={t('saving')}>{t('save')}</BusyLabel>
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
