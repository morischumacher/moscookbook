'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps something on the page while it animates away.
 *
 * `{open && <Menu/>}` removes the menu the instant it closes, so whatever it
 * did on the way in, it could only vanish on the way out. With this the
 * element stays for `exitMs` after `open` turns false, marked
 * `data-state="closed"`, which is what the CSS (`.drop-panel`, `.fade-layer`
 * in globals.css) animates out. It comes back at once if reopened meanwhile.
 */
export function usePresence(open: boolean, exitMs = 320): { mounted: boolean; state: 'open' | 'closed' } {
    const [gone, setGone] = useState(!open);
    const [wasOpen, setWasOpen] = useState(open);

    // Reopened: it is here again. Adjusted while rendering rather than in an
    // effect, so the first frame of the reopened menu is already right.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setGone(false);
    }

    useEffect(() => {
        if (open) return;
        const timer = window.setTimeout(() => setGone(true), exitMs);
        return () => window.clearTimeout(timer);
    }, [open, exitMs]);

    return { mounted: open || !gone, state: open ? 'open' : 'closed' };
}
