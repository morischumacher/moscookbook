/**
 * A picture inside the text, written as `![what it shows](address "caption")`.
 *
 * A plain `<img>` rather than next/image: the size is not known from the
 * Markdown, and these are our own uploads, already shrunk before they were
 * sent. Lazy, because an entry with six pictures should not fetch the sixth
 * before anybody has scrolled to it. The title, when there is one, becomes a
 * caption under it.
 */
export default function InlinePicture({ src, alt, title }: { src?: string | Blob; alt?: string; title?: string }) {
    if (typeof src !== 'string' || !/^https?:\/\//.test(src)) return null;

    return (
        <span className="my-8 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt ?? ''} loading="lazy" className="w-full rounded-lg border border-line" />
            {title && <span className="mt-2 block text-center text-sm text-muted [font-family:var(--font-sans)]">{title}</span>}
        </span>
    );
}

