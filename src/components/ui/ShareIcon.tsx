/**
 * The share symbol everyone knows from their phone: a box with an arrow
 * leaving it. Every place that sends something out of the cookbook — a
 * recipe, a collection, an entry, a shopping list — wears it, so "share"
 * looks the same wherever it is. Sized to the
 * text beside it and coloured like it.
 */
export default function ShareIcon({ className = 'h-[1.1em] w-[1.1em]' }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={`inline-block shrink-0 ${className}`}
        >
            <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16" />
            <path d="M12 15V3" />
            <path d="M8.5 6.5 12 3l3.5 3.5" />
        </svg>
    );
}
