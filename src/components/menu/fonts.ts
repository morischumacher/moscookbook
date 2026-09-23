import { Cormorant_Garamond, Playfair_Display } from 'next/font/google';

/**
 * The two typefaces a menu card can be set in besides the site's own. Loaded
 * only by the pages that show a card, so no other page carries them.
 */
export const cormorant = Cormorant_Garamond({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    style: ['normal', 'italic'],
    display: 'swap',
});

export const playfair = Playfair_Display({
    subsets: ['latin'],
    weight: ['400', '600', '700'],
    style: ['normal', 'italic'],
    display: 'swap',
});
