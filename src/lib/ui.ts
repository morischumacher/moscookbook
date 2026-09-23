/**
 * The shapes the interface is made of, written down once.
 *
 * There were five different primary buttons: `px-6 py-3` on the auth pages and
 * the two big forms, `px-4 py-2 text-sm` on the admin index, `px-5 py-2` on
 * exactly one page, `h-10 px-4 text-sm` on the invitations, and a flex-wrapped
 * `h-10` on the backup panel. Two admin pages under the same navigation had
 * visibly different-sized primary buttons. Six admin pages had four different
 * top paddings between them.
 *
 * None of that was a decision. It is what happens when a class list is copied
 * from whichever file was open, and it is invisible to whoever is writing the
 * page and obvious to whoever is looking at two of them.
 *
 * Two sizes, because the site genuinely uses two: the large one for the single
 * thing a page is for — sign in, save the recipe, publish — and the compact one
 * for a button that sits in a row of other controls. Both are at least 44px
 * tall, which is the size a target has to be to be hit on a phone without
 * looking properly.
 *
 * These are strings rather than components on purpose: a <Button> would have to
 * grow a prop for every place that needs an anchor, a submit, a label wrapping
 * a file input or a disabled state, and the class list is the part that was
 * actually drifting.
 */

/** The one thing this page is for. */
export const buttonPrimary =
    'inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-50';

/** A primary button standing in a row with others. */
export const buttonPrimarySmall =
    'inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-50';

/**
 * For a hand that is busy: cook mode's "done, next", reached without looking.
 * Taller than the others and the width of its row.
 */
export const buttonPrimaryLarge =
    'inline-flex min-h-14 items-center justify-center rounded-full bg-ink px-6 text-lg font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-50';

/** Floating over the page, in a corner: a running kitchen timer. */
export const buttonFloating =
    'fixed bottom-4 right-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 text-lg text-page shadow-lg transition-opacity hover:opacity-85';

/** The alternative to a primary button: outlined, same size. */
export const buttonSecondary =
    'inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50';

/** A destructive primary button. Only where something is being removed. */
export const buttonDanger =
    'inline-flex min-h-11 items-center justify-center rounded-full bg-danger px-4 text-sm font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-50';

/**
 * The page's own container. `md:px-8` was the majority and `sm:px-8` the rest,
 * which left the admin's section navigation sitting 16px inboard of the heading
 * directly under it between 640 and 767 pixels.
 */
export const pageContainer = 'container mx-auto max-w-3xl px-4 md:px-8';

/** The space above a page's first heading. Four values existed. */
export const pageTop = 'pt-10 sm:pt-14';

/** A page heading, with the rule under it that most of them had. */
export const pageHeading =
    'border-b border-line pb-6 text-3xl font-extrabold tracking-tight sm:text-4xl';

/**
 * A small thing sitting on a photograph: the rating on a tile, the position in
 * a collection.
 *
 * Translucent rather than solid, and that is not decoration. It has to be
 * legible over whatever picture somebody uploads, and 70% black is dark enough
 * for white on top of it even where the photograph behind is white — while
 * still reading as something laid *on* the picture rather than a hole punched
 * in it. A gradient would promise the same and break it over a plate of
 * polenta.
 *
 * **Scrim, not ink.** This was `bg-ink/75 text-page` and it was wrong twice
 * over. It emitted no background at all, because Tailwind silently drops an
 * opacity modifier on a colour it cannot parse (tailwind.config.ts), so the
 * number was sitting bare on the photograph. And the colours it named follow
 * the scheme, which is right for every surface on the site except this one:
 * in dark mode it inverted to a white pill with black writing on a picture
 * that had not changed at all. The scrim tokens do not follow the scheme, for
 * the reason written beside them in globals.css.
 *
 * Each caller adds its own padding, because one holds an icon and a number and
 * the other holds a number.
 */
export const photoBadge =
    'absolute left-2 top-2 flex items-center rounded-full bg-scrim/70 text-on-scrim';

/**
 * The round backing under a control that sits on a photograph — the favourite
 * heart on a tile, the same heart on a recipe's hero image.
 *
 * Lighter than `photoBadge` at 55%, because what sits on it is a drawn shape
 * with a stroke rather than four-point type, and a shape needs 3:1 where text
 * needs 4.5:1. Written down here because it existed twice, by hand, in two
 * files, and both copies named the ink.
 */
export const photoControl =
    'flex h-9 w-9 items-center justify-center rounded-full bg-scrim/55 text-on-scrim';

/**
 * One of a small set of choices, all of them visible at once.
 *
 * A radio group that looks like a row of pills rather than a `<select>`: three
 * options that can all be read is a glance, and a select is a tap, a list and
 * a second tap for the same decision. At 44px tall it is also hittable without
 * looking, which a native select on a phone is not.
 *
 * Written down here the first time a second one was needed, rather than
 * copied. The selected state reuses the ink-on-page inversion the primary
 * button uses, because "this is the one" should look the same wherever it is
 * said.
 */
export function chip(selected: boolean): string {
    return (
        'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors ' +
        (selected ? 'border-ink bg-ink text-page' : 'border-control hover:border-ink')
    );
}
