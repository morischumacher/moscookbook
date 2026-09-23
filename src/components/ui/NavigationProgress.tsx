'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A thin line across the top of the window while the next page is on its way.
 *
 * Every page on this site is rendered on request, so between the tap and the
 * new page there is a moment where nothing on screen has changed — and a
 * moment with no answer reads as a tap that did not register, so people tap
 * again. The line answers straight away, in the accent colour, and the page's
 * own `loading.tsx` takes over once the server starts sending it.
 *
 * It listens for clicks on ordinary links rather than wrapping the router,
 * because every link on the site is already a link: nothing has to remember
 * to opt in. A navigation that finishes within the delay never shows it at
 * all, so fast pages do not flicker.
 */
const SHOW_AFTER_MS = 120;

type Phase = 'idle' | 'waiting' | 'running' | 'finishing';

function isPlainNavigation(event: MouseEvent): URL | null {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return null;
    }

    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!anchor || !anchor.href) return null;
    if (anchor.target && anchor.target !== '_self') return null;
    if (anchor.hasAttribute('download')) return null;

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return null;

    // A link to where we already are, or to a spot on this page, loads nothing.
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return null;
    }

    return url;
}

export default function NavigationProgress() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [phase, setPhase] = useState<Phase>('idle');
    const timer = useRef<number | null>(null);

    // Arrived: run to the end, then fade.
    useEffect(() => {
        if (timer.current !== null) window.clearTimeout(timer.current);

        setPhase((current) => {
            if (current === 'running') {
                timer.current = window.setTimeout(() => setPhase('idle'), 350);
                return 'finishing';
            }
            return 'idle';
        });
    }, [pathname, searchParams]);

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (!isPlainNavigation(event)) return;

            if (timer.current !== null) window.clearTimeout(timer.current);
            setPhase('waiting');
            timer.current = window.setTimeout(() => setPhase('running'), SHOW_AFTER_MS);
        };

        // Capture: Next's <Link> cancels the click to route it itself, so by
        // the time it bubbles up it looks like nothing happened.
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, []);

    if (phase === 'idle' || phase === 'waiting') return null;

    return (
        <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 print:hidden"
        >
            <div
                className={`h-full bg-accent ${
                    phase === 'finishing'
                        ? 'w-full opacity-0 transition-[width,opacity] duration-300'
                        : 'nav-progress-run'
                }`}
            />
        </div>
    );
}
