import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * "Sammlungen — mo'scookbook": a page's own name in the browser tab and the
 * history. Most pages had none, so every tab said only "mo'scookbook" and
 * five open ones could not be told apart.
 */
export function titled(namespace: string, key: string, index = true) {
    return async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
        const { locale } = await params;
        const t = await getTranslations({ locale, namespace });
        return {
            title: `${t(key)} — mo'scookbook`,
            ...(index ? {} : { robots: { index: false, follow: false } }),
        };
    };
}
