'use client';

import { useRef, useState } from 'react';
import { parseRecipeText } from '@/lib/recipeParser';
import type { Ingredient } from '@/lib/recipe';

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

const PLACEHOLDER = `Käsespätzle

Zutaten
400 g Spätzle
200 g Bergkäse
2 Zwiebeln
Salz

Zubereitung
Zwiebeln in Butter goldbraun braten.
Spätzle kochen und abgießen.
Alles schichten und servieren.`;

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
    const [mode, setMode] = useState<Mode>('paste');
    const [text, setText] = useState('');
    const [url, setUrl] = useState('');
    const [useAiForText, setUseAiForText] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const photoInput = useRef<HTMLInputElement>(null);

    const modes: { id: Mode; label: string; hint: string }[] = [
        { id: 'paste', label: 'Text einfügen', hint: 'Rezept hineinkopieren' },
        { id: 'link', label: 'Link importieren', hint: 'Von einer Rezeptseite' },
        ...(aiEnabled
            ? [{ id: 'photo' as Mode, label: 'Foto', hint: 'Kochbuchseite abfotografieren' }]
            : []),
    ];

    const reset = () => {
        setError('');
        setNote('');
    };

    const handlePaste = async () => {
        reset();
        if (!text.trim()) {
            setError('Bitte zuerst ein Rezept einfügen.');
            return;
        }

        if (!useAiForText) {
            const parsed = parseRecipeText(text);
            onImport({ ...parsed, category: '', nationality: '' });
            setNote(
                `${parsed.ingredients.length} Zutaten erkannt. Bitte kurz prüfen und korrigieren.`
            );
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
                setError(data.message || 'Der Import ist fehlgeschlagen.');
                return;
            }

            onImport(data.recipe);
            setNote(
                data.source === 'fallback'
                    ? 'KI war nicht verfügbar — der Text wurde lokal zerlegt.'
                    : `${data.recipe.ingredients.length} Zutaten erkannt. Bitte kurz prüfen.`
            );
        } catch {
            // Never lose the user's work to a network hiccup.
            const parsed = parseRecipeText(text);
            onImport({ ...parsed, category: '', nationality: '' });
            setNote('Keine Verbindung zur KI — der Text wurde lokal zerlegt.');
        } finally {
            setBusy(false);
        }
    };

    const handleLink = async () => {
        reset();
        if (!url.trim()) {
            setError('Bitte einen Link einfügen.');
            return;
        }

        setBusy(true);
        try {
            const res = await fetch('/api/import/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || 'Die Seite konnte nicht gelesen werden.');
                return;
            }

            onImport(data.recipe);
            setNote(
                data.partial
                    ? 'Die Seite hatte nur Teilangaben — bitte den Rest ergänzen.'
                    : 'Rezept übernommen. Bitte kurz prüfen.'
            );
        } catch {
            setError('Die Seite konnte nicht geladen werden.');
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
                setError(data.message || 'Das Foto konnte nicht gelesen werden.');
                return;
            }

            onImport(data.recipe);
            setNote(`${data.recipe.ingredients.length} Zutaten erkannt. Bitte kurz prüfen.`);
        } catch {
            setError('Das Foto konnte nicht gelesen werden.');
        } finally {
            setBusy(false);
            if (photoInput.current) photoInput.current.value = '';
        }
    };

    return (
        <section className="mb-10 rounded-xl border border-[var(--color-border)] bg-black/[0.02] dark:bg-white/[0.03] p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">
                Schnell befüllen
            </h2>

            <div className="flex flex-wrap gap-2 mb-4" role="tablist">
                {modes.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={mode === entry.id}
                        onClick={() => {
                            setMode(entry.id);
                            reset();
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === entry.id
                            ? 'bg-black text-white dark:bg-white dark:text-black'
                            : 'border border-[var(--color-border)] hover:border-gray-500'
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
                        placeholder={PLACEHOLDER}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-transparent p-3 font-mono text-sm outline-none focus:border-gray-900 dark:focus:border-white"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handlePaste}
                            disabled={busy}
                            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                        >
                            {busy ? 'Wird gelesen…' : 'Übernehmen'}
                        </button>
                        {aiEnabled && (
                            <label className="flex items-center gap-2 text-sm text-gray-500">
                                <input
                                    type="checkbox"
                                    checked={useAiForText}
                                    onChange={(event) => setUseAiForText(event.target.checked)}
                                    className="h-4 w-4"
                                />
                                KI verwenden (genauer, kostet ein paar Cent)
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
                                handleLink();
                            }
                        }}
                        placeholder="https://www.chefkoch.de/rezepte/…"
                        className="flex-1 rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 outline-none focus:border-gray-900 dark:focus:border-white"
                    />
                    <button
                        type="button"
                        onClick={handleLink}
                        disabled={busy}
                        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                        {busy ? 'Wird geladen…' : 'Importieren'}
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
                        disabled={busy}
                        className="text-sm"
                    />
                    <p className="text-sm text-gray-500">
                        Fotografiere eine Kochbuchseite oder einen handgeschriebenen Zettel.
                        {busy && ' Wird gelesen…'}
                    </p>
                </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {note && !error && <p className="mt-3 text-sm text-green-700 dark:text-green-400">{note}</p>}
        </section>
    );
}
