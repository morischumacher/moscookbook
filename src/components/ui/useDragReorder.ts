'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

/**
 * Rows reordered by dragging a handle — with a finger as with a mouse — or,
 * with the handle focused, by the arrow keys (work #48: "↑" and "↓" one row
 * at a time was the only way, and a list of twenty is a lot of taps).
 *
 * Pointer events rather than HTML drag and drop, which does nothing on a
 * phone. The rows are found in `container` by `data-drag-row`; while dragging,
 * `drag` says which row is moving, by how much, and where it would land.
 */
export function useDragReorder(container: RefObject<HTMLElement | null>, onMove: (from: number, to: number) => void) {
    const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
    const start = useRef<{ y: number; top: number; mids: number[] | null; height: number } | null>(null);

    const rows = () => [...(container.current?.querySelectorAll<HTMLElement>('[data-drag-row]') ?? [])];

    const targetFor = (y: number, from: number) => {
        const mids = start.current?.mids ?? [];
        let to = from;
        // Past the middle of a row below, or above the middle of one above.
        for (let index = from + 1; index < mids.length && y > mids[index]; index += 1) to = index;
        for (let index = from - 1; index >= 0 && y < mids[index]; index -= 1) to = index;
        return to;
    };

    const handle = (index: number) => ({
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            // Measured on the first move, not here: a list may draw its rows more
            // compactly while something is dragged (the recipe form folds the
            // hints under its rows away), and the places must be those.
            start.current = { y: event.clientY, top: rows()[index]?.getBoundingClientRect().top ?? 0, mids: null, height: 0 };
            setDrag({ from: index, to: index, dy: 0 });
        },
        onPointerMove: (event: PointerEvent<HTMLElement>) => {
            if (!start.current || !drag) return;
            if (start.current.mids === null) {
                const all = rows();
                // The row's height and the gap to the next: how far the others step aside.
                const gap = all[drag.from + 1] ? all[drag.from + 1].getBoundingClientRect().top - all[drag.from].getBoundingClientRect().bottom : 0;
                // Where the row went when the list folded: the pointer's start moves with it, so the row stays under the finger.
                const jump = (all[drag.from]?.getBoundingClientRect().top ?? start.current.top) - start.current.top;
                start.current = { ...start.current, y: start.current.y + jump, mids: all.map((row) => row.getBoundingClientRect().top + row.offsetHeight / 2), height: (all[drag.from]?.offsetHeight ?? 0) + Math.max(0, gap) };
            }
            setDrag({ from: drag.from, to: targetFor(event.clientY, drag.from), dy: event.clientY - start.current.y });
        },
        onPointerUp: () => {
            if (drag && drag.to !== drag.from) onMove(drag.from, drag.to);
            start.current = null;
            setDrag(null);
        },
        onPointerCancel: () => {
            start.current = null;
            setDrag(null);
        },
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            const to = index + (event.key === 'ArrowUp' ? -1 : 1);
            if (to < 0 || to >= rows().length) return;
            onMove(index, to);
            // The handle of the row in its new place keeps the focus.
            requestAnimationFrame(() => rows()[to]?.querySelector<HTMLElement>('[data-drag-handle]')?.focus());
        },
        'data-drag-handle': true,
        style: { touchAction: 'none' as const, cursor: drag?.from === index ? 'grabbing' : 'grab' },
    });

    /** How a row is drawn while something is dragged: the moving one follows the pointer, the ones it passes step aside. */
    const rowStyle = (index: number) => {
        if (!drag) return undefined;
        // Opaque, lifted: what is under it does not show through.
        if (index === drag.from) return { transform: `translateY(${drag.dy}px)`, position: 'relative' as const, zIndex: 10, boxShadow: '0 8px 24px rgb(0 0 0 / 0.18)' };
        const height = start.current?.height ?? 0;
        const shift = drag.to > drag.from && index > drag.from && index <= drag.to ? -height : drag.to < drag.from && index >= drag.to && index < drag.from ? height : 0;
        return { transform: `translateY(${shift}px)`, transition: 'transform 120ms ease' };
    };

    return { drag, handle, rowStyle };
}

/** A list with the row at `from` moved to `to`. */
export function moved<T>(list: T[], from: number, to: number): T[] {
    const next = [...list];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    return next;
}
