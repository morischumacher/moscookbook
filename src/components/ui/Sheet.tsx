'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useDialogFocus } from './useDialogFocus';

/**
 * A card that rises from the bottom of a phone (and sits in the middle of a
 * wider screen) holding one thing to do: a menu of a page's quieter actions,
 * or a small form that does not deserve a page of its own.
 *
 * Built so pages stop stacking every section and every button underneath
 * each other: the page shows what it is for, and the rest is a tap on "…"
 * away, all in one place.
 */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    const t = useTranslations('Dialog');
    const card = useRef<HTMLDivElement>(null);
    useDialogFocus(card, onClose);

    // The page behind must not scroll under the sheet.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    return (
        // To the bottom of what is visible (dvh), not of the layout viewport:
        // on an iPhone Safari's toolbar floats over that, and covered the
        // sheet's last rows (work #52).
        <div
            className="fixed inset-x-0 top-0 z-[200] flex h-[100dvh] items-end justify-center bg-scrim/40 sm:items-center sm:p-4"
            onPointerDown={(event) => {
                if (!card.current?.contains(event.target as Node)) onClose();
            }}
        >
            <div
                ref={card}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-page p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:rounded-2xl"
            >
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-base font-bold">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('close')}
                        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-surface hover:text-ink"
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

/** One row of a sheet's menu: the width of the sheet, easy to hit. */
export const sheetItem =
    'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left font-medium transition-colors hover:bg-surface disabled:opacity-50';
