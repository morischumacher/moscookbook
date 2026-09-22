import type { ReactNode } from 'react';

/**
 * A heading that opens.
 *
 * `<details>`/`<summary>` rather than a button and a piece of state, and that
 * is not laziness. Native disclosure is keyboard-operable, announced as such
 * by a screen reader, findable by the browser's own "find on page" (which
 * opens it), and works before any JavaScript has loaded — all of which a
 * `useState` toggle has to be given one at a time, and usually is not.
 *
 * It exists because the device page had five hundred words of iOS instructions
 * permanently unrolled under a list somebody visits to revoke a key. The
 * instructions are worth having; they are worth having *once*, on the day the
 * shortcut is built.
 *
 * `[&::-webkit-details-marker]:hidden` and `[&[open]_.chevron]:rotate-90` are
 * the two lines that let the native element carry its own arrow without
 * looking like 1997.
 */
export default function Disclosure({
    title,
    subtitle,
    children,
    defaultOpen = false,
}: {
    title: string;
    /** One line under the title, visible while closed. */
    subtitle?: string;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    return (
        <details
            open={defaultOpen}
            className="group border-b border-line last:border-b-0"
        >
            <summary className="flex cursor-pointer list-none items-baseline gap-3 py-4 [&::-webkit-details-marker]:hidden">
                <span
                    aria-hidden="true"
                    className="chevron mt-1 shrink-0 text-faint transition-transform group-open:rotate-90"
                >
                    ▸
                </span>
                <span className="min-w-0">
                    <span className="block font-bold leading-tight">{title}</span>
                    {subtitle && (
                        <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>
                    )}
                </span>
            </summary>

            <div className="pb-6 pl-6">{children}</div>
        </details>
    );
}
