'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { readForeignFile, type ForeignRecipe } from '@/lib/foreignImport';
import { uploadPicture } from '@/lib/uploadClient';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * "Import from another app": choose an export, see what is in it, pick, and
 * the chosen recipes arrive under Drafts. See lib/foreignImport for the
 * formats and why the file is read here rather than on the server.
 */
export default function ForeignImport() {
    const t = useTranslations('ForeignImport');
    const [found, setFound] = useState<ForeignRecipe[] | null>(null);
    const [chosen, setChosen] = useState<Set<number>>(new Set());
    const [state, setState] = useState<{ busy: boolean; done: number; created: number; skipped: number; error: string }>({
        busy: false,
        done: 0,
        created: 0,
        skipped: 0,
        error: '',
    });

    const read = async (file: File | undefined) => {
        if (!file) return;
        setState((current) => ({ ...current, error: '', created: 0, skipped: 0, done: 0 }));
        let recipes: ReturnType<typeof readForeignFile>;
        try {
            recipes = readForeignFile(file.name, new Uint8Array(await file.arrayBuffer()));
        } catch {
            // A damaged file: said, instead of a button that does nothing.
            setFound(null);
            setState((current) => ({ ...current, error: t('nothingFound') }));
            return;
        }
        setFound(recipes);
        setChosen(new Set(recipes.map((_, index) => index)));
        if (recipes.length === 0) setState((current) => ({ ...current, error: t('nothingFound') }));
    };

    const importChosen = async () => {
        if (!found) return;
        const picked = found.filter((_, index) => chosen.has(index));
        setState({ busy: true, done: 0, created: 0, skipped: 0, error: '' });

        let created = 0;
        let skipped = 0;
        for (let start = 0; start < picked.length; start += 5) {
            const batch = picked.slice(start, start + 5);
            const payload = [];
            for (const recipe of batch) {
                let imageUrl = '';
                if (recipe.image) {
                    const result = await uploadPicture(new File([recipe.image.data.slice().buffer as ArrayBuffer], 'photo', { type: recipe.image.type }));
                    if (result.ok) imageUrl = result.url;
                }
                payload.push({
                    title: recipe.title,
                    description: recipe.description,
                    ingredients: recipe.ingredients,
                    instructions: recipe.instructions,
                    servings: recipe.servings,
                    prepMinutes: recipe.prepMinutes,
                    cookMinutes: recipe.cookMinutes,
                    category: recipe.category,
                    tags: recipe.tags,
                    sourceUrl: /^https?:\/\//.test(recipe.sourceUrl) ? recipe.sourceUrl : '',
                    imageUrl,
                });
            }

            const res = await fetch('/api/import/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipes: payload }),
            }).catch(() => null);
            if (!res?.ok) {
                setState({ busy: false, done: start, created, skipped, error: t('failed') });
                return;
            }
            const data: { created: number; skipped: string[] } = await res.json();
            created += data.created;
            skipped += data.skipped.length;
            setState({ busy: true, done: Math.min(start + batch.length, picked.length), created, skipped, error: '' });
        }

        setState({ busy: false, done: picked.length, created, skipped, error: '' });
        setFound(null);
    };

    return (
        <section className="mt-12 border-t border-line pt-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{t('title')}</h2>
            <p className="mt-2 text-sm text-muted">{t('explain')}</p>

            <input
                type="file"
                accept=".paprikarecipes,.paprikarecipe,.zip,.cook,.json"
                onChange={(event) => void read(event.target.files?.[0])}
                aria-label={t('title')}
                className="mt-4 text-sm"
            />

            {state.error && <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p>}

            {found && found.length > 0 && (
                <div className="mt-4">
                    <p className="text-sm">
                        {t('found', { count: found.length })}{' '}
                        <button type="button" className="underline underline-offset-4" onClick={() => setChosen(chosen.size === found.length ? new Set() : new Set(found.map((_, index) => index)))}>
                            {chosen.size === found.length ? t('none') : t('all')}
                        </button>
                    </p>
                    <ul className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-line text-sm">
                        {found.map((recipe, index) => (
                            <li key={index} className="border-b border-line last:border-b-0">
                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={chosen.has(index)}
                                        onChange={() =>
                                            setChosen((current) => {
                                                const next = new Set(current);
                                                if (next.has(index)) next.delete(index);
                                                else next.add(index);
                                                return next;
                                            })
                                        }
                                        className="h-5 w-5 accent-black"
                                    />
                                    <span className="min-w-0 flex-1 truncate">{recipe.title}</span>
                                    <span className="shrink-0 text-xs text-faint">
                                        {t('summary', { ingredients: recipe.ingredients.length, from: recipe.from })}
                                        {recipe.image ? ' · 📷' : ''}
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <button type="button" onClick={() => void importChosen()} disabled={state.busy || chosen.size === 0} className={`${buttonPrimarySmall} mt-4`}>
                        <BusyLabel busy={state.busy} busyText={t('importing', { done: state.done, total: chosen.size })}>
                            {t('import', { count: chosen.size })}
                        </BusyLabel>
                    </button>
                </div>
            )}

            {!state.busy && (state.created > 0 || state.skipped > 0) && (
                <p role="status" className="mt-4 text-sm">
                    {t('result', { created: state.created, skipped: state.skipped })}{' '}
                    <Link href="/admin/drafts" className="font-medium underline underline-offset-4">
                        {t('toDrafts')}
                    </Link>
                </p>
            )}
        </section>
    );
}
