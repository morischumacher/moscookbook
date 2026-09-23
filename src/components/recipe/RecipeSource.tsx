import { sourceForUrl } from '@/lib/capture';

/**
 * Where this one came from.
 *
 * A recipe shared off a phone arrives with no memory attached to it: three
 * weeks later there is a title and a picture and no answer to "was this the
 * video, or the one from that blog?" — which matters more than it sounds,
 * because whether the method can be trusted depends on which.
 *
 * The link is the answer, and it was stored all along on the capture the
 * recipe was made from. Nothing new is written; this reads what is there.
 *
 * Named platforms get their name, because "Instagram" is the thing somebody
 * actually remembers. Everything else gets its hostname, which for a food blog
 * is its name anyway — `smittenkitchen.com` is more use than "Website".
 */
export default function RecipeSource({
    url,
    className,
}: {
    url: string | null;
    className?: string;
}) {
    if (!url) return null;

    let host: string;
    try {
        host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
        // A stored value that is not a URL is a row from an older import or a
        // hand-typed note. Nothing to link to and nothing worth saying.
        return null;
    }

    const kind = sourceForUrl(url);
    const label =
        kind === 'youtube'
            ? 'YouTube'
            : kind === 'instagram'
              ? 'Instagram'
              : kind === 'tiktok'
                ? 'TikTok'
                : host;

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-ink ${className ?? ''}`}
        >
            {/* A link leaving the site, drawn rather than written: an arrow out
                of a box is the one icon everybody already reads, and the label
                beside it carries the meaning for anyone who does not. */}
            <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
            >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
            </svg>
            <span className="truncate">{label}</span>
        </a>
    );
}
