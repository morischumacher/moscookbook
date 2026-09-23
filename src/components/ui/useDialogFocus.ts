'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What a modal owes a keyboard: focus goes in when it opens, Tab stays
 * inside it, Escape closes it, and focus goes back to whatever opened it.
 *
 * The share dialog and cook mode did the first and third only — Tab walked
 * out onto the page behind, and closing left focus on <body>. Cook mode also
 * refocused itself every half second while a timer ran, because its effect
 * depended on a callback that was new on every render; the callback is read
 * through a ref here, so this runs once per opening.
 */
export function useDialogFocus(container: RefObject<HTMLElement | null>, onClose: () => void, initial?: RefObject<HTMLElement | null>) {
    const close = useRef(onClose);
    useEffect(() => {
        close.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        (initial?.current ?? container.current)?.focus();

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close.current();
                return;
            }
            if (event.key !== 'Tab' || !container.current) return;
            const items = [...container.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            const inside = container.current.contains(document.activeElement);
            if (event.shiftKey && (document.activeElement === first || !inside)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            // Back where it was, if that is still on the page.
            if (opener?.isConnected) opener.focus();
        };
        // Once per opening: the refs are stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
