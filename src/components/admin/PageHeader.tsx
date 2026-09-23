import type { ReactNode } from 'react';
import { pageHeading, pageTop } from '@/lib/ui';

/**
 * The top of an admin page, once.
 *
 * There were five constructions of it across seven pages — a `<header>` with
 * the flex classes on it, a `<div>` with the same classes and a different
 * margin, a bare `<h1>` carrying `mb-2`, a bare `<h1>` carrying nothing — and
 * they differed in the things nobody writes down: whether the heading sat on
 * the same line as the button beside it, how much air was under it, whether
 * the explanation was a `font-serif` paragraph or a plain one. Four main views,
 * four designs, which is what it looked like.
 *
 * One component, so those are decided once and cannot drift again. What a page
 * still chooses is what it *has*: a title, sometimes a sentence, sometimes
 * something to press.
 *
 * `children` is the action — a button, a link, a pair of them — and it sits on
 * the heading's baseline on a wide screen and wraps under it on a narrow one,
 * which is the behaviour the two pages that got this right already had.
 *
 * No back link. Several pages carried one ("Back to the inbox") and several
 * did not, which made it look like a property of the page rather than of
 * whoever added it; the admin navigation is on every one of these pages and
 * is the way back from all of them.
 */
export default function PageHeader({
    title,
    intro,
    children,
}: {
    title: string;
    /** One line about what this page is for. Omitted where it would restate the title. */
    intro?: string;
    children?: ReactNode;
}) {
    return (
        <header className={`${pageTop} ${pageHeading} mb-8`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
                {children && <div className="flex flex-wrap items-center gap-4">{children}</div>}
            </div>

            {/* Its own size and weight: inside the header it inherited the
                heading's, and a sentence of help became four lines of display type. */}
            {intro && <p className="mt-3 font-serif text-base font-normal leading-relaxed tracking-normal text-muted sm:text-lg">{intro}</p>}
        </header>
    );
}
