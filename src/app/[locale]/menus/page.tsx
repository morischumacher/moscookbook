import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { menuStyle } from '@/lib/menu';
import { buttonPrimarySmall, pageContainer, pageHeading, pageTop } from '@/lib/ui';

/** Every menu, the next evening first, then the ones that have been. */
export default async function MenusPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const [t, user, menus] = await Promise.all([
        getTranslations('Menus'),
        getCurrentUser(),
        prisma.menu.findMany({
            orderBy: [{ date: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
            take: 200,
            select: {
                id: true,
                title: true,
                slug: true,
                occasion: true,
                date: true,
                style: true,
                items: { select: { course: true } },
            },
        }),
    ]);
    const formatDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <main className={`${pageContainer} pb-32`}>
            <div className={`${pageTop} mb-8 flex flex-wrap items-end justify-between gap-4`}>
                <div className="min-w-0">
                    <h1 className={pageHeading}>{t('title')}</h1>
                    <p className="mt-2 max-w-prose text-muted">{t('intro')}</p>
                </div>
                {user?.admin && (
                    <Link href="/admin/menus/new" className={buttonPrimarySmall}>
                        {t('newMenu')}
                    </Link>
                )}
            </div>

            {menus.length === 0 ? (
                <p className="py-20 text-center text-muted">{t('empty')}</p>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {menus.map((menu) => (
                        <li key={menu.id}>
                            <Link
                                href={`/menus/${menu.slug}`}
                                className="flex h-full flex-col rounded-2xl border border-line p-5 transition-colors hover:border-ink"
                            >
                                <span className="text-xs font-semibold uppercase tracking-widest text-faint">
                                    {[menu.occasion, menu.date ? formatDate.format(menu.date) : null].filter(Boolean).join(' · ') ||
                                        t(`style_${menuStyle(menu.style)}`)}
                                </span>
                                <span className="mt-1 text-xl font-bold leading-snug">{menu.title}</span>
                                <span className="mt-2 text-sm text-muted">
                                    {t('courseCount', { count: new Set(menu.items.map((item) => item.course)).size })}
                                    {' · '}
                                    {t(`style_${menuStyle(menu.style)}`)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
