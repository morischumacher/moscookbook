import type { MetadataRoute } from 'next';

/**
 * What the site is when it is saved to a home screen.
 *
 * Without this — and without the apple-icon.png beside it — iOS has nothing to
 * draw, so it takes a screenshot of the page, crops it, and puts the first
 * letter of the title on a grey square. That grey M was the application's face
 * on the one device it is used on most.
 *
 * The icon is the oyster, drawn from the same two paths as the logo and the
 * rating, in the page colour on the brand orange — the way the mark reads
 * inside the wordmark. Three growth rings rather than the component's two,
 * because a home-screen icon has the room the component does not, and the
 * source SVG is kept at public/brand/oyster-icon.svg so it can be redrawn at
 * any size rather than resampled.
 *
 * `display: standalone` is what makes the saved icon open without Safari's
 * address bar and tab strip, which is the difference between a bookmark and
 * something that behaves like an application in the kitchen.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Mo'sCookbook",
        // What fits under the icon on a home screen, which is about twelve
        // characters before iOS truncates it.
        short_name: "Mo'sCookbook",
        description: 'Rezepte, gesammelt und nachgekocht.',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFF8F0',
        theme_color: '#FFF8F0',
        /*
         * "Share to Mo'sCookbook" in Android's and desktop Chrome's share
         * sheet, once the site is installed. A link or a caption shared from
         * any app lands in the inbox, the same as the iOS Shortcut does. Plain
         * GET: what is shared is a title, a text and a link, and the page it
         * opens asks the admin's session, not a device token.
         */
        share_target: {
            action: '/de/share',
            method: 'GET',
            params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
            {
                src: '/brand/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                // Not `maskable`: the oyster sits inside a field that Android
                // would crop into. A plain icon is letterboxed instead, which
                // keeps the shell whole.
                purpose: 'any',
            },
            {
                src: '/brand/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
        ],
    };
}
