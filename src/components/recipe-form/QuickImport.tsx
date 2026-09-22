'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { parseRecipeText } from '@/lib/recipeParser';
import type { Ingredient } from '@/lib/recipe';
import { buttonPrimarySmall } from '@/lib/ui';

export interface ImportedDraft {
    title: string;
    description: string;
    category: string;
    nationality: string;
    ingredients: Ingredient[];
    instructions: string;
    imageUrl?: string;
    servings?: number | null;
    prepMinutes?: number | null;
    cookMinutes?: number | null;
}

type Mode = 'paste' | 'link' | 'photo';


function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result);
            resolve(result.slice(result.indexOf(',') + 1));
        };
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
    });
}

/**
 * The fast lane into the form: paste a recipe, import a link, or photograph a
 * cookbook page. Paste works entirely in the browser with no API and no cost —
 * the photo tab only appears when AI import is configured.
 */
export default function QuickImport({
    aiEnabled,
    onImport,
}: {
    aiEnabled: boolean;
    onImport: (draft: ImportedDraft) => void;
}) {
    const t = useTranslations('QuickImport');
    const tAi = useTranslations('Ai');
    const [mode, setMode] = useState<Mode>('paste');
    const [text, setText] = useState('');
    const [url, setUrl] = useState('');
    const [useAiForText, setUseAiForText] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const photoInput = useRef<HTMLInputElement>(null);

    const modes: { id: Mode; label: string }[] = [
        { id: 'paste', label: t('tabPaste') },
        { id: 'link', label: t('tabLink') },
        // Always offered, greyed without a key. A tab that appears only once
        // the AI is configured cannot be discovered by the person who would
        // configure it.
        { id: 'photo' as Mode, label: t('tabPhoto') },
    ];

    const reset = () => {
        setError('');
        setNote('');
    };

    const handlePaste = async () => {
        reset();
        if (!text.trim()) {
            setError(t('pasteFirst'));
            return;
        }

        if (!useAiForText) {
            const parsed = parseRecipeText(text);
            onImport({ ...parsed, category: '', nationality: '' });
            setNote(t('recognised', { count: parsed.ingredients.length }));
            return;
        }

        setBusy(true);
        try {
            const res = await fetch('/api/import/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'text', text }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || t('importFailed'));
                return;
            }

            onImport(data.recipe);
            setNote(
                data.source === 'fallback'
                    ? t('aiFallback')
                    : t('recognised', { count: data.recipe.ingredients.length })
            );
        } catch {
            // Never lose the user's work to a network hiccup.
            const parsed = parseRecipeText(text);
            onImport({ ...parsed, category: '', nationality: '' });
            setNote(t('aiOffline'));
        } finally {
            setBusy(false);
        }
    };

    const handleLink = async (force = false) => {
        reset();
        if (!url.trim()) {
            setError(t('urlFirst'));
            return;
        }

        setBusy(true);
        try {
            const res = await fetch('/api/import/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, ...(force ? { force: true } : {}) }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || t('pageFailed'));
                return;
            }

            onImport(data.recipe);
            setNote(
                data.usedAi
                    ? t('importedWithAi')
                    : data.partial
                        ? t('partial')
                        : t('imported')
            );
        } catch {
            setError(t('pageFailed'));
        } finally {
            setBusy(false);
        }
    };

    /**
     * "Build the recipe from this with the AI", whatever tab is open.
     *
     * The three tabs are three *inputs*, not three different features, and
     * until now the AI was reachable from one and a half of them: a tick-box
     * on paste, implicitly on photo, and not at all on a link — where the
     * rules ran, came back with a title and a picture, and that was the end of
     * it unless the scoring happened to call the result damaged.
     *
     * This is the same button in all three, and it always means the same
     * thing: ignore what the scoring thinks, ask the model, fill what the
     * rules could not. It is disabled only when there is no key that has been
     * seen to work — see `verifiedAt` in the schema for why "seen to work" and
     * not "present".
     */
    const handleAi = async () => {
        if (mode === 'photo') {
            photoInput.current?.click();
            return;
        }

        if (mode === 'paste') {
            if (!text.trim()) {
                setError(t('pasteFirst'));
                return;
            }
            await runAiText(text);
            return;
        }

        if (!url.trim()) {
            setError(t('urlFirst'));
            return;
        }
        await handleLink(true);
    };

    const runAiText = async (value: string) => {
        reset();
        setBusy(true);
        try {
            const res = await fetch('/api/import/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'text', text: value }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || t('importFailed'));
                return;
            }

            onImport(data.recipe);
            setNote(
                data.source === 'fallback'
                    ? t('aiFallback')
                    : t('recognised', { count: data.recipe.ingredients.length })
            );
        } catch {
            setError(t('importFailed'));
        } finally {
            setBusy(false);
        }
    };

    const handlePhoto = async (file: File) => {
        reset();
        setBusy(true);
        try {
            const base64 = await fileToBase64(file);
            const res = await fetch('/api/import/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'image', base64, mediaType: file.type }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || t('photoFailed'));
                return;
            }

            onImport(data.recipe);
            setNote(t('recognised', { count: data.recipe.ingredients.length }));
        } catch {
            setError(t('photoFailed'));
        } finally {
            setBusy(false);
            if (photoInput.current) photoInput.current.value = '';
        }
    };

    return (
        <section className="mb-10 rounded-xl border border-line bg-surface p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted mb-4">
                {t('heading')}
            </h2>

            {/*
                These were marked up as ARIA tabs — role="tablist", role="tab",
                aria-selected — with no tabpanel, no aria-controls, no ids and
                no arrow-key handling. A screen reader announced "tab 1 of 3"
                and then the arrow keys did nothing, which is worse than having
                no roles at all: the promise was made and then broken.
                
                They are not tabs. They are three buttons that pick a mode, and
                `aria-pressed` says exactly that with nothing left to implement.
            */}
            <div className="flex flex-wrap gap-2 mb-4">
                {modes.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        aria-pressed={mode === entry.id}
                        onClick={() => {
                            setMode(entry.id);
                            reset();
                        }}
                        className={`flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors ${mode === entry.id
                            ? 'bg-ink text-page'
                            : 'border border-line hover:border-ink'
                            }`}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            {mode === 'paste' && (
                <div className="flex flex-col gap-3">
                    <textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        rows={8}
                        placeholder={t('pastePlaceholder')}
                        className="w-full rounded-lg border border-control bg-transparent p-3 font-mono text-sm outline-none focus:border-ink"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handlePaste}
                            disabled={busy}
                            className={buttonPrimarySmall}
                        >
                            {busy ? t('reading') : t('apply')}
                        </button>
                        {aiEnabled && (
                            <label className="flex items-center gap-2 text-sm text-muted">
                                <input
                                    type="checkbox"
                                    checked={useAiForText}
                                    onChange={(event) => setUseAiForText(event.target.checked)}
                                    className="h-4 w-4"
                                />
                                {t('useAi')}
                            </label>
                        )}
                    </div>
                </div>
            )}

            {mode === 'link' && (
                <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                        type="url"
                        inputMode="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                handleLink(false);
                            }
                        }}
                        placeholder={t('urlPlaceholder')}
                        className="flex-1 rounded-lg border border-control bg-transparent px-3 py-2 outline-none focus:border-ink"
                    />
                    <button
                        type="button"
                        onClick={() => handleLink(false)}
                        disabled={busy}
                        className={buttonPrimarySmall}
                    >
                        {busy ? t('loading') : t('import')}
                    </button>
                </div>
            )}

            {mode === 'photo' && (
                <div className="flex flex-col gap-3">
                    <input
                        ref={photoInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) handlePhoto(file);
                        }}
                        disabled={busy || !aiEnabled}
                        className="text-sm"
                    />
                    <p className="text-sm text-muted">
                        {aiEnabled ? t('photoHint') : tAi('polishOff')}
                        {busy && ` ${t('reading')}`}
                    </p>
                </div>
            )}

            {/* One button, under all three inputs, meaning the same thing in
                each: ask the model about whatever is in the box above. */}
            <div className="mt-4 border-t border-line pt-3">
                <button
                    type="button"
                    onClick={handleAi}
                    disabled={busy || !aiEnabled}
                    className="text-sm underline underline-offset-4 disabled:text-faint disabled:no-underline"
                >
                    {busy ? t('reading') : tAi('rebuildWithAi')}
                </button>
                {!aiEnabled && <p className="mt-1 text-sm text-faint">{tAi('polishOff')}</p>}
            </div>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            {note && !error && <p className="mt-3 text-sm text-success">{note}</p>}
        </section>
    );
}
