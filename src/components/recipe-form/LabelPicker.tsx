'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MAX_LABELS } from '@/lib/recipeLabels';
import { labelClass } from './formStyles';

/**
 * Categories or cuisines: the usual ones as chips to tap, anything else typed
 * in. More than one — a soup can be a starter and a main — up to five.
 */
export default function LabelPicker({
    id,
    label,
    presets,
    namespace,
    value,
    onChange,
    known = [],
}: {
    id: string;
    label: string;
    presets: readonly string[];
    /** Where the presets' translations are: 'Categories' or 'Cuisines'. */
    namespace: 'Categories' | 'Cuisines';
    value: string[];
    onChange: (next: string[]) => void;
    /** Ones other recipes already use, offered too. */
    known?: string[];
}) {
    const t = useTranslations('RecipeForm');
    const tLabel = useTranslations(namespace);
    const [text, setText] = useState('');
    const show = (entry: string) => (tLabel.has(entry) ? tLabel(entry) : entry);
    const full = value.length >= MAX_LABELS;

    const toggle = (entry: string) =>
        onChange(value.includes(entry) ? value.filter((item) => item !== entry) : full ? value : [...value, entry]);

    const add = () => {
        const entry = text.trim().slice(0, 60);
        setText('');
        if (!entry || full) return;
        // A preset typed in its translation is the preset.
        const preset = presets.find((key) => key.toLowerCase() === entry.toLowerCase() || show(key).toLowerCase() === entry.toLowerCase());
        const chosen = preset ?? entry;
        if (!value.includes(chosen)) onChange([...value, chosen]);
    };

    const offered = [...new Set([...presets, ...known, ...value])];

    return (
        <div>
            <p id={`${id}-label`} className={labelClass}>
                {label}
            </p>
            <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
                {offered.map((entry) => {
                    const on = value.includes(entry);
                    return (
                        <button
                            key={entry}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(entry)}
                            disabled={!on && full}
                            className={`min-h-9 rounded-full px-3 text-sm transition-colors disabled:opacity-40 ${
                                on ? 'bg-ink text-page' : 'border border-control text-muted hover:border-ink hover:text-ink'
                            }`}
                        >
                            {show(entry)}
                        </button>
                    );
                })}
            </div>
            <div className="mt-2 flex gap-2">
                <input
                    id={id}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            add();
                        }
                    }}
                    onBlur={add}
                    disabled={full}
                    placeholder={full ? t('labelsFull', { max: MAX_LABELS }) : t('labelsAdd')}
                    // Named by the list it adds to; the placeholder goes as
                    // soon as somebody types.
                    aria-label={`${label}: ${t('labelsAdd')}`}
                    className="w-full min-w-0 rounded-lg border border-control bg-transparent px-3 py-2 text-sm outline-none focus:border-ink disabled:opacity-50"
                />
            </div>
        </div>
    );
}
