'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Oyster from './brand/Oyster';
import styles from './Rating.module.css';

/** What the server says after a rating is saved. Its numbers, not ours. */
export interface RatingResult {
    rating: number;
    average: number;
    totalRatings: number;
}

interface RatingProps {
    value: number;
    max?: number;
    /** Present and not readonly: the oysters can be clicked. */
    recipeId?: number;
    readonly?: boolean;
    onRated?: (result: RatingResult) => void;
    /** `sm` is the tile's rating: the same mark, smaller. */
    size?: 'md' | 'sm';
    /** Set when the oysters sit on a photograph rather than on the page. */
    onDark?: boolean;
    /** Put focus on the first oyster when shown (after "Bewerten"). */
    focusOnShow?: boolean;
}

/**
 * The oyster rating.
 *
 * Two things here were wrong in ways that do not show up until someone tries.
 *
 * The oysters were `<div onClick>`: unreachable by keyboard, invisible to a
 * screen reader, and not announced as controls. They are buttons now, which is
 * what they always were.
 *
 * And a failure used `alert()`, which stops the page dead with a browser dialog
 * to say a rating did not save. It is a line of text next to the oysters now.
 */
export default function Rating({
    value,
    max = 5,
    recipeId,
    readonly = false,
    onRated,
    size = 'md',
    onDark = false,
    focusOnShow = false,
}: RatingProps) {
    // "Bewerten" is replaced by the oysters: without this, focus fell to the
    // page and a keyboard had to find its way back.
    const first = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (focusOnShow) first.current?.focus();
    }, [focusOnShow]);
    const t = useTranslations('Rating');
    // "4,5" on a German page, not "4.5".
    const oneDecimal = new Intl.NumberFormat(useLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const [pending, setPending] = useState<number | null>(null);
    const [error, setError] = useState('');

    const isInteractive = Boolean(recipeId) && !readonly;

    const handleRate = async (rating: number) => {
        if (!isInteractive || pending !== null) return;

        setPending(rating);
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: rating }),
            });

            if (!res.ok) {
                setError(res.status === 401 ? t('loginRequired') : t('failed'));
                return;
            }

            const data = await res.json();

            // The server has just recomputed the average across every rating.
            // Recomputing it again here from the numbers this component happens
            // to be holding is how a displayed average drifts from the real one.
            onRated?.({
                rating: data.rating ?? rating,
                average: data.average ?? 0,
                totalRatings: data.totalRatings ?? 0,
            });
        } catch {
            setError(t('error'));
        } finally {
            setPending(null);
        }
    };

    // While choosing, the oysters follow the pointer; otherwise they show the
    // value they were given.
    const shown = hoverValue ?? pending ?? value;

    const positions = Array.from({ length: max }, (_, index) => index + 1);

    /** How much of oyster `position` is filled, 0 to 1. Averages are fractional. */
    const fillFor = (position: number) => Math.max(0, Math.min(1, shown - position + 1));

    /*
     * The pixel size the stylesheet will draw these at.
     *
     * The component picks its level of detail from the `size` prop, and this
     * is the one place where the drawn size comes from CSS instead — so
     * without this the small shells were drawn with the detail meant for
     * twenty-four pixels and then scaled to fifteen, which is three rings'
     * worth of ink in a space that holds one.
     *
     * Kept in step with --oyster in Rating.module.css by hand, because a
     * custom property cannot be read from here without measuring the DOM.
     */
    const drawnSize = size === 'sm' ? 15 : 24;

    const oysters = positions.map((position) => {
        const fill = fillFor(position);

        const shape = (
            <span className={styles.oyster}>
                <Oyster variant="outline" size={drawnSize} className={styles.empty} />
                {fill > 0 && (
                    <span className={styles.fill} style={{ width: `${fill * 100}%` }}>
                        <Oyster variant="solid" size={drawnSize} className={styles.full} />
                    </span>
                )}
            </span>
        );

        if (!isInteractive) return <span key={position}>{shape}</span>;

        return (
            <button
                key={position}
                ref={position === 1 ? first : undefined}
                type="button"
                onClick={() => handleRate(position)}
                onMouseEnter={() => setHoverValue(position)}
                onMouseLeave={() => setHoverValue(null)}
                onFocus={() => setHoverValue(position)}
                onBlur={() => setHoverValue(null)}
                disabled={pending !== null}
                aria-label={t('rateN', { value: position, max })}
                aria-pressed={Math.round(value) === position}
                className={styles.button}
            >
                {shape}
            </button>
        );
    });

    return (
        <span
            className={`${styles.wrapper}${size === 'sm' ? ` ${styles.sm}` : ''}${onDark ? ` ${styles.onDark}` : ''}`}
        >
            <span
                className={styles.row}
                // One label for the group. Without it a screen reader reads five
                // decorative images and says nothing about the rating.
                {...(isInteractive
                    ? { role: 'group', 'aria-label': t('submitYours') }
                    : { role: 'img', 'aria-label': t('screenReader', { average: oneDecimal.format(value), max }) })}
            >
                {oysters}
            </span>

            {error && (
                <span role="alert" className={styles.error}>
                    {error}
                </span>
            )}
        </span>
    );
}
