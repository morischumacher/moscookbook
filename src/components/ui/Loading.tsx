import Oyster from '@/components/brand/Oyster';
import styles from './Loading.module.css';

/**
 * Something is happening, said in one place.
 *
 * There were four ways of saying it, all of them a sentence in grey — "Loading
 * the inbox…", "Loading…", nothing at all — and none of them appeared during
 * the wait that is actually noticeable, which is the one between pressing a
 * tab and the next page arriving. So the honest summary of the old behaviour
 * is: the app told you it was working exactly when you could already tell, and
 * said nothing when you could not.
 *
 * One component now, with the oyster filling in. It carries its own label
 * because "loading" on its own is the least useful word available — what is
 * loading is the thing worth saying, and it is what makes the wait feel like a
 * step in a process rather than a stall.
 *
 * `role="status"` rather than `aria-live` by hand: it is announced once when
 * it appears and not again, which is right for something that says one thing
 * and then goes away.
 */
export default function Loading({
    label,
    /** What is doing the work, when it is not us. See `model` below. */
    model,
    size = 28,
    className,
}: {
    label: string;
    model?: string | null;
    size?: number;
    className?: string;
}) {
    return (
        <div
            role="status"
            className={`flex items-center gap-3 text-muted ${className ?? ''}`}
        >
            <span className={`${styles.loader} shrink-0`}>
                <Oyster size={size} />
            </span>

            <span className="text-sm leading-snug">
                {label}
                {/*
                    Which model is reading, when one is.

                    Waiting on a provider is a different kind of wait from
                    waiting on our own database: it costs money, it takes
                    seconds rather than milliseconds, and it can come back
                    with nothing. Naming it is how the person watching knows
                    which of those they are in — and, when the answer is poor,
                    which model to blame for it.
                */}
                {model && (
                    <span className="mt-0.5 block text-xs uppercase tracking-widest text-faint">
                        {model}
                    </span>
                )}
            </span>
        </div>
    );
}
