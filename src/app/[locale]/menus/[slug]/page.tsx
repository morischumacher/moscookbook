import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';
import { menuBy } from '@/lib/menuQuery';
import MenuCard from '@/components/menu/MenuCard';
import MenuShare from '@/components/menu/MenuShare';
import PrintButton from '@/components/menu/PrintButton';
import AddToShopping from '@/components/shopping/AddToShopping';
import { pageContainer } from '@/lib/ui';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One menu: the card as it will look on the table, and around it what the
 * evening needs — print it, send it to the guests, shop for it, cook it.
 * Everything but the card is left off the paper.
 */
export default async function MenuPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
    const { locale, slug } = await params;
    const [menu, user, t] = await Promise.all([menuBy({ slug }), getCurrentUser(), getTranslations('Menus')]);
    if (!menu) notFound();

    return (
        <main className={`${pageContainer} pb-32 pt-6 sm:pt-10 print:p-0`}>
            <div className="-mx-4 sm:mx-0 print:mx-0">
                <MenuCard menu={menu} locale={locale} />
            </div>

            <div className="print:hidden">
                <div className="mt-8 flex flex-wrap items-center gap-3">
                    <PrintButton label={t('print')} />
                    {user && menu.recipes.length > 0 && <AddToShopping menuId={menu.id} guests={menu.guests} />}
                    {user?.admin && (
                        <Link href={`/admin/menus/${menu.id}`} className="text-sm underline underline-offset-4 hover:text-muted">
                            {t('edit')}
                        </Link>
                    )}
                </div>

                {menu.recipes.length > 0 && (
                    <section className="mt-10 border-t border-line pt-6">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t('recipesTitle')}</h2>
                        <ul className="flex flex-col gap-2">
                            {menu.recipes.map((recipe) => (
                                <li key={recipe.slug}>
                                    <Link href={`/recipe/${recipe.slug}`} className="font-medium underline underline-offset-4">
                                        {recipe.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {user?.admin && (
                    <div className="mt-10">
                        <MenuShare id={menu.id} initialToken={menu.shareToken} />
                    </div>
                )}
            </div>
        </main>
    );
}
