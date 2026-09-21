import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * A layout that exists only to give the registration page its own preview card.
 *
 * The page itself is a client component, so it cannot export `generateMetadata`
 * — and this is the one page in the application that is almost never reached by
 * anybody typing the address. It is reached by a link somebody was sent, which
 * means what the link looks like in their chat window *is* the invitation.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Auth' });

    return {
        title: t('registerTitle'),
        description: t('inviteShareDescription'),
        openGraph: {
            title: t('inviteShareTitle'),
            description: t('inviteShareDescription'),
        },
        twitter: {
            title: t('inviteShareTitle'),
            description: t('inviteShareDescription'),
        },
        // An invitation is for one person. Nothing about it belongs in a search
        // index, and the code is in the address.
        robots: { index: false, follow: false },
    };
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return children;
}
