import Image from 'next/image';

/**
 * The wordmark, in one place.
 *
 * It was inlined in the navigation and nowhere else, which is why a printed
 * recipe came out unbranded: the print stylesheet hides `nav`, and the logo
 * went with it. One component means the masthead on a printed page is the same
 * mark as the one on screen, and stays that way.
 *
 * The oyster inside it is the same shape as the rating's — see brand/Oyster.
 */
export default function Logo({
    height = 48,
    className,
    priority = false,
}: {
    height?: number;
    className?: string;
    priority?: boolean;
}) {
    return (
        <Image
            src="/logo.png"
            alt="mo'scookbook"
            // The source is 640×360; the height prop drives the rendered size
            // and next/image serves the right one.
            width={640}
            height={360}
            className={className}
            style={{ height, width: 'auto' }}
            priority={priority}
        />
    );
}
