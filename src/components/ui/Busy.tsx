import Oyster from '@/components/brand/Oyster';
import styles from './Loading.module.css';

/**
 * The loading mark at the size of a word, for inside a button.
 *
 * The same shell as the page-sized `Loading`, with the same rings arriving —
 * one waiting sign across the whole site rather than a spinner here, a
 * greyed-out label there and nothing at all somewhere else. Decorative: the
 * button it sits in says what is happening in words.
 */
export function BusyMark({ size = 16 }: { size?: number }) {
    return (
        <span className={`${styles.loader} inline-flex shrink-0`} aria-hidden="true">
            <Oyster size={size} />
        </span>
    );
}

/**
 * A button's label, with the mark in front of it while the button waits.
 *
 * `busyText` replaces the label while waiting ("Saving…" for "Save"), which is
 * what a screen reader then announces through the button's own name. The
 * width is left to change: a label that grows by a word is less confusing
 * than one reserved for text that is not there.
 */
export function BusyLabel({
    busy,
    busyText,
    children,
}: {
    busy: boolean;
    busyText?: string;
    children: React.ReactNode;
}) {
    return (
        <span className="inline-flex items-center justify-center gap-2">
            {busy && <BusyMark />}
            <span>{busy && busyText ? busyText : children}</span>
        </span>
    );
}
