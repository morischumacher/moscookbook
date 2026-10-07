'use client';

import { useState, type KeyboardEvent, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { conventional } from '@/lib/ingredientShape';

/** One of the cookbook's recipes, its title in the form's language: a row can be it ("Kimchi"). */
export interface LinkableRecipe {
    id: number;
    title: string;
}

/** A name with what it is in a few words ("Saeujeot" · "Gesalzene, fermentierte Garnelen"): found by either. */
export interface Described {
    name: string;
    info: string;
}

type Suggestion = { kind: 'name'; name: string; info?: string } | { kind: 'recipe'; recipe: LinkableRecipe };

/** Whether the words typed are in a description: each of them, or one long one ("gesalzene"). */
function inInfo(typed: string, info: string): boolean {
    const text = info.toLowerCase();
    const words = typed.split(/[\s,]+/).filter((word) => word.length >= 3);
    return words.length > 0 && (words.every((word) => text.includes(word)) || words.some((word) => word.length >= 6 && text.includes(word)));
}

/**
 * The ingredient field, suggesting the names the cookbook already uses
 * while typing ("Frü" → "Frühlingszwiebeln"): the same thing gets the same
 * name in every recipe, and the shopping list merges on the name. A
 * suggestion is a tap (or ↓ and Enter); typing on ignores them.
 *
 * The cookbook's own recipes are offered too ("Kimchi · Rezept"): chosen,
 * the row is that recipe and links to it.
 */
export default function ItemInput({
    value,
    names,
    described = [],
    recipes = [],
    onChange,
    onRecipe,
    onTidy,
    onEnter,
    inputRef,
    placeholder,
    label,
    className,
}: {
    value: string;
    names: string[];
    /** Names found by their few words too. */
    described?: Described[];
    recipes?: LinkableRecipe[];
    onChange: (next: string) => void;
    /** A recipe of the cookbook chosen: the row becomes it. */
    onRecipe?: (recipe: LinkableRecipe) => void;
    /** The name tidied on leaving the field ("frischer Ingwer" → "Ingwer, frisch"); without it, onChange. */
    onTidy?: (next: string) => void;
    /** Enter with no suggestion chosen: the editor adds a row. */
    onEnter: () => void;
    inputRef?: Ref<HTMLInputElement>;
    placeholder: string;
    label: string;
    className: string;
}) {
    const recipeLabel = useTranslations('RecipeForm')('recipeSuggestion');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [id] = useState(() => `item-suggest-${Math.random().toString(36).slice(2, 9)}`);

    const q = value.trim().toLowerCase();
    const byStart = <T,>(list: T[], text: (entry: T) => string) => [
        ...list.filter((entry) => text(entry).toLowerCase().startsWith(q)),
        ...list.filter((entry) => !text(entry).toLowerCase().startsWith(q) && text(entry).toLowerCase().includes(q)),
    ];
    const matches: Suggestion[] =
        open && q.length >= 2
            ? [
                  // The recipes first: a few, and the reason to type "Kim" may well be the Kimchi we make ourselves.
                  ...byStart(recipes, (recipe) => recipe.title)
                      .slice(0, 2)
                      .map((recipe): Suggestion => ({ kind: 'recipe', recipe })),
                  ...byStart(names, (name) => name)
                      .filter((name) => name.toLowerCase() !== q)
                      .slice(0, 6)
                      .map((name): Suggestion => ({ kind: 'name', name })),
                  // Then what it is: "Gesalzene Garnelen" → "Saeujeot · Gesalzene, fermentierte Garnelen".
                  ...described
                      .filter((entry) => inInfo(q, entry.info) && !entry.name.toLowerCase().includes(q))
                      .slice(0, 2)
                      .map((entry): Suggestion => ({ kind: 'name', name: entry.name, info: entry.info })),
              ]
                  .filter((choice, index, all) => choice.kind === 'recipe' || all.findIndex((other) => other.kind === 'name' && other.name === choice.name) === index)
                  .slice(0, 7)
            : [];

    const choose = (choice: Suggestion) => {
        if (choice.kind === 'recipe') onRecipe?.(choice.recipe);
        else onChange(choice.name);
        setOpen(false);
        setActive(-1);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' && matches.length > 0) {
            event.preventDefault();
            setActive((at) => (at + 1) % matches.length);
        } else if (event.key === 'ArrowUp' && matches.length > 0) {
            event.preventDefault();
            setActive((at) => (at <= 0 ? matches.length - 1 : at - 1));
        } else if (event.key === 'Escape') {
            setOpen(false);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (active >= 0 && matches[active]) choose(matches[active]);
            else onEnter();
        }
    };

    return (
        <div className="relative order-first w-full sm:order-none sm:w-0 sm:flex-1">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                    setOpen(true);
                    setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                // After a tap on a suggestion has landed.
                onBlur={() => {
                    // Written the cookbook's way on leaving the field: "frischer Ingwer" → "Ingwer, frisch" (lib/ingredientShape).
                    const tidy = conventional(value);
                    if (tidy !== value.trim() && tidy) (onTidy ?? onChange)(tidy);
                    setTimeout(() => setOpen(false), 150);
                }}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                aria-label={label}
                role="combobox"
                aria-expanded={matches.length > 0}
                aria-controls={id}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
                autoComplete="off"
                className={className + ' w-full'}
            />
            {matches.length > 0 && (
                <ul id={id} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-page shadow-lg">
                    {matches.map((choice, index) => (
                        <li
                            key={choice.kind === 'recipe' ? `recipe-${choice.recipe.id}` : choice.name}
                            id={`${id}-${index}`}
                            role="option"
                            aria-selected={index === active}
                            onPointerDown={(event) => {
                                event.preventDefault();
                                choose(choice);
                            }}
                            className={`cursor-pointer px-3 py-2.5 text-sm ${index === active ? 'bg-surface' : 'hover:bg-surface'}`}
                        >
                            {choice.kind === 'recipe' ? (
                                <>
                                    {choice.recipe.title} <span className="text-xs text-info">· {recipeLabel}</span>
                                </>
                            ) : (
                                <>
                                    {choice.name}
                                    {choice.info && <span className="text-xs text-muted"> · {choice.info}</span>}
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
