'use client';

import { useState, type KeyboardEvent, type Ref } from 'react';

/**
 * The ingredient field, suggesting the names the cookbook already uses
 * while typing ("Frü" → "Frühlingszwiebeln"): the same thing gets the same
 * name in every recipe, and the shopping list merges on the name. A
 * suggestion is a tap (or ↓ and Enter); typing on ignores them.
 */
export default function ItemInput({
    value,
    names,
    onChange,
    onEnter,
    inputRef,
    placeholder,
    label,
    className,
}: {
    value: string;
    names: string[];
    onChange: (next: string) => void;
    /** Enter with no suggestion chosen: the editor adds a row. */
    onEnter: () => void;
    inputRef?: Ref<HTMLInputElement>;
    placeholder: string;
    label: string;
    className: string;
}) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [id] = useState(() => `item-suggest-${Math.random().toString(36).slice(2, 9)}`);

    const q = value.trim().toLowerCase();
    const matches =
        open && q.length >= 2
            ? [
                  ...names.filter((name) => name.toLowerCase().startsWith(q)),
                  ...names.filter((name) => !name.toLowerCase().startsWith(q) && name.toLowerCase().includes(q)),
              ]
                  .filter((name) => name.toLowerCase() !== q)
                  .slice(0, 6)
            : [];

    const choose = (name: string) => {
        onChange(name);
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
                onBlur={() => setTimeout(() => setOpen(false), 150)}
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
                    {matches.map((name, index) => (
                        <li
                            key={name}
                            id={`${id}-${index}`}
                            role="option"
                            aria-selected={index === active}
                            onPointerDown={(event) => {
                                event.preventDefault();
                                choose(name);
                            }}
                            className={`cursor-pointer px-3 py-2.5 text-sm ${index === active ? 'bg-surface' : 'hover:bg-surface'}`}
                        >
                            {name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
