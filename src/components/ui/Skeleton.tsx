/**
 * The shape of what is coming, before it has come.
 *
 * A page that is still being read from the database shows its outline — the
 * grid of tiles, the picture and the title of a recipe — so the eye lands
 * where the content will be, and nothing jumps when it arrives. The pulse is
 * the only movement, and it stops for anybody who asked for less motion.
 */
export function Skeleton({ className = '' }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={`block animate-pulse rounded-lg bg-surface motion-reduce:animate-none ${className}`}
        />
    );
}

/** The recipe grid, as it will be laid out. */
export function TileGridSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" aria-hidden="true">
            {Array.from({ length: count }, (_, index) => (
                <div key={index}>
                    <Skeleton className="aspect-square w-full rounded-xl" />
                    <Skeleton className="mt-2 h-4 w-3/4" />
                    <Skeleton className="mt-1.5 h-3 w-1/3" />
                </div>
            ))}
        </div>
    );
}

/** Rows of a list: blog entries, collections, drafts, the admin tables. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="mt-8 flex flex-col gap-6" aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex items-center gap-4">
                    <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="mt-2 h-3 w-1/3" />
                    </div>
                </div>
            ))}
        </div>
    );
}
