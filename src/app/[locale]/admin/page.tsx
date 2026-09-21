import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import DeleteRecipeButton from '@/components/DeleteRecipeButton';
import BackupPanel from '@/components/admin/BackupPanel';
import { buttonPrimarySmall, pageContainer, pageHeading, pageTop } from '@/lib/ui';

interface AdminRecipeRow {
    id: number;
    title: string;
    slug: string;
    category: string | null;
    views: number;
    images: { url: string }[];
}

export default async function AdminDashboard() {
    const t = await getTranslations('Admin');
    const tCategory = await getTranslations('Categories');

    const recipes: AdminRecipeRow[] = await prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' },
        // The dashboard is for editing, not browsing; an unbounded list would
        // grow into a slow page for no benefit.
        take: 100,
        select: {
            id: true,
            title: true,
            slug: true,
            category: true,
            views: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <header className={`flex flex-wrap items-baseline justify-between gap-4 ${pageTop} ${pageHeading}`}>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('dashboard')}</h1>
                <Link
                    href="/admin/create"
                    className={buttonPrimarySmall}
                >
                    {t('createNew')}
                </Link>
            </header>

            {recipes.length === 0 ? (
                <p className="py-20 text-center text-muted">{t('noRecipes')}</p>
            ) : (
                <ul className="divide-y divide-line">
                    {recipes.map((recipe) => (
                        <li key={recipe.id} className="flex items-center gap-4 py-4">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
                                {recipe.images[0] && (
                                    <Image
                                        src={recipe.images[0].url}
                                        alt=""
                                        fill
                                        sizes="48px"
                                        className="object-cover"
                                    />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/recipe/${recipe.slug}`}
                                    className="block truncate font-medium underline-offset-4 hover:underline"
                                >
                                    {recipe.title}
                                </Link>
                                <p className="text-xs uppercase tracking-widest text-muted">
                                    {recipe.category
                                        ? tCategory.has(recipe.category)
                                            ? tCategory(recipe.category)
                                            : recipe.category
                                        : '—'}
                                    {' · '}
                                    {t('viewCount', { count: recipe.views })}
                                </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-3 text-sm">
                                <Link
                                    href={`/admin/edit/${recipe.id}`}
                                    className="underline underline-offset-4 hover:text-muted"
                                >
                                    {t('edit')}
                                </Link>
                                <DeleteRecipeButton recipeId={recipe.id} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <BackupPanel />
        </main>
    );
}
