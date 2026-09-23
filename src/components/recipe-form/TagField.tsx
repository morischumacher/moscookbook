'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DIET_TAGS, normaliseTags } from '@/lib/tags';
import { labelClass } from './formStyles';

/**
 * The recipe's tags: typed, one at a time (Enter or a comma adds one), shown
 * as chips that can be taken off.
 *
 * Vegetarian and vegan are offered from the ingredients — "this looks
 * vegetarian, tag it?" — and never set without a tap: the guess reads words,
 * and "Brühe" can be either kind.
 */
export default function TagField({
    value,
    onChange,
}: {
    value: string[];
    onChange: (tags: string[]) => void;
}) {
    const t = useTranslations('RecipeForm');
    const tTags = useTranslations('Tags');
    const [text, setText] = useState('');

    const add = (raw: string) => {
        const next = normaliseTags([...value, ...raw.split(',')]);
        onChange(next);
        setText('');
    };

    const label = (tag: string) => ((DIET_TAGS as readonly string[]).includes(tag) ? tTags(tag as 'vegan') : tag);

    return (
        <div>
            <label htmlFor="tags" className={labelClass}>{t('tags')}</label>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-control px-2 py-1.5 focus-within:border-ink">
                {value.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-surface py-1 pl-3 pr-1 text-sm">
                        {label(tag)}
                        <button
                            type="button"
                            onClick={() => onChange(value.filter((entry) => entry !== tag))}
                            aria-label={t('removeTag', { tag: label(tag) })}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-danger"
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    id="tags"
                    value={text}
                    onChange={(event) => {
                        if (event.target.value.includes(',')) add(event.target.value);
                        else setText(event.target.value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && text.trim()) {
                            event.preventDefault();
                            add(text);
                        }
                        if (event.key === 'Backspace' && !text && value.length > 0) onChange(value.slice(0, -1));
                    }}
                    onBlur={() => text.trim() && add(text)}
                    placeholder={value.length === 0 ? t('tagsPlaceholder') : ''}
                    className="min-w-32 flex-1 bg-transparent px-1 py-1 outline-none"
                />
            </div>

            <p className="mt-2 text-sm text-muted">{t('tagsHint')}</p>
        </div>
    );
}
