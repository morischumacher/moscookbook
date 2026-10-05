import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import WelcomePicture from '@/components/account/WelcomePicture';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Welcome' });
    return { title: `${t('title')} — mo'scookbook`, robots: { index: false, follow: false } };
}

/** Where only the path may go on to: never another site. */
function safeNext(value: string | string[] | undefined, locale: string): string {
    const next = typeof value === 'string' ? value : '';
    return /^\/(?!\/)[^\s\\]*$/.test(next) && !next.includes('/welcome') ? next : `/${locale}`;
}

/**
 * A new account's first page: a picture, or its initials. Asked once, before
 * anything else (proxy.ts), because people are shown by it everywhere — on a
 * shared shopping list, beside who buys what, under "I've cooked this".
 */
export default async function WelcomePage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ next?: string | string[] }>;
}) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    const user = await getCurrentUser();
    if (!user) redirect(`/${locale}/login`);
    const [t, me] = await Promise.all([
        getTranslations('Welcome'),
        prisma.user.findUnique({ where: { id: user.id }, select: { name: true, firstName: true, avatarUrl: true } }),
    ]);

    return (
        <main className={`${pageContainer} max-w-xl pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-3`}>{t('title')}</h1>
            <p className="mb-8 font-serif text-lg leading-relaxed text-muted">{t('intro')}</p>
            <WelcomePicture name={me?.firstName || me?.name || user.name} initialUrl={me?.avatarUrl ?? null} next={safeNext(query.next, locale)} />
        </main>
    );
}
