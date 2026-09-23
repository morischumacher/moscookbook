'use client';

import { useId, useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

export interface PickOption {
    id: number;
    title: string;
    image?: string | null;
}

/**
 * Several things chosen from a long list, in an order.
 *
 * What was chosen is at the top, in order, each with a way to move it and to
 * take it out. Below it, one search box; typing narrows the list to what
 * matches and a tap adds it. This replaces two different pickers — a
 * dropdown that allowed exactly one recipe, and a search box whose results
 * appeared as a strip of chips under a banner — with one that reads the same
 * wherever it is used.
 */
export default function PickList({
    label,
    hint,
    options,
    value,
    onChange,
}: {
    label: string;
    hint?: string;
    options: PickOption[];
    value: number[];
    onChange: (ids: number[]) => void;
}) {
    const t = useTranslations('Editor');
    const searchId = useId();
    const [query, setQuery] = useState('');

    const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
    const chosen = value.map((id) => byId.get(id)).filter((option): option is PickOption => Boolean(option));

    const matches = useMemo(() => {
        const wanted = query.trim().toLocaleLowerCase();
        const open = options.filter((option) => !value.includes(option.id));
        const found = wanted ? open.filter((option) => option.title.toLocaleLowerCase().includes(wanted)) : open;
        return found.slice(0, 8);
    }, [options, value, query]);

    const move = (index: number, by: number) => {
        const next = [...value];
        const [moved] = next.splice(index, 1);
        next.splice(index + by, 0, moved);
        onChange(next);
    };

    return (
        <div>
            <label htmlFor={searchId} className="mb-2 block text-sm font-bold uppercase tracking-widest text-muted">
                {label}
            </label>

            {chosen.length === 0 ? (
                <p className="mb-3 text-sm text-faint">{t('nothingChosen')}</p>
            ) : (
                <ol className="mb-3 flex flex-col divide-y divide-line rounded-xl border border-line">
                    {chosen.map((option, index) => (
                        <li key={option.id} className="flex items-center gap-3 px-3 py-2">
                            <span className="w-5 shrink-0 text-right text-xs text-faint">{index + 1}</span>
                            {option.image !== undefined && (
                                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-surface">
                                    {option.image && (
                                        <Image src={option.image} alt="" fill sizes="36px" className="object-cover" />
                                    )}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 truncate font-medium">{option.title}</span>
                            <span className="flex shrink-0 items-center gap-1 text-sm">
                                <button
                                    type="button"
                                    onClick={() => move(index, -1)}
                                    disabled={index === 0}
                                    aria-label={t('moveUp', { title: option.title })}
                                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface disabled:opacity-30"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(index, 1)}
                                    disabled={index === chosen.length - 1}
                                    aria-label={t('moveDown', { title: option.title })}
                                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface disabled:opacity-30"
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange(value.filter((id) => id !== option.id))}
                                    aria-label={t('remove', { title: option.title })}
                                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-danger-surface hover:text-danger"
                                >
                                    ×
                                </button>
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchToAdd')}
                className="w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink"
            />

            {matches.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                    {matches.map((option) => (
                        <li key={option.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange([...value, option.id]);
                                    setQuery('');
                                }}
                                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-sm transition-colors hover:border-ink"
                            >
                                <span aria-hidden="true">+</span> {option.title}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {query.trim() !== '' && matches.length === 0 && (
                <p className="mt-2 text-sm text-faint">{t('noMatch')}</p>
            )}

            {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
        </div>
    );
}
