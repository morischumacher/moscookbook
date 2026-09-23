import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import DeleteRecipeButton from '@/components/DeleteRecipeButton';
import RecipeRowActions from '@/components/admin/RecipeRowActions';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';
import BackupPanel from '@/components/admin/BackupPanel';
import { backupStatus } from '@/lib/backupStatus';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall, pageContainer } from '@/lib/ui';
import PageHeader from '@/components/admin/PageHeader';

interface AdminRecipeRow {
    id: number;
    title: string;
    slug: string;
    category: string | null;
    views: number;
    isPublic: boolean;
    shareToken: string | null;
    images: { url: string }[];
}

export default async function AdminDashboard({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const t = await getTranslations('Admin');
    const tCategory = await getTranslations('Categories');
    const tVisibility = await getTranslations('Visibility');
    const backup = await backupStatus();

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
            isPublic: true,
            shareToken: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('dashboard')}>
                <Link href="/admin/create" className={buttonPrimarySmall}>
                    {t('createNew')}
                </Link>
            </PageHeader>

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
                                    {' · '}
                                    {/* Said in the row rather than shown as a
                                        colour, because "public" is the one
                                        property of a recipe somebody needs to
                                        be able to read at a glance and be
                                        sure about. */}
                                    <span className={recipe.isPublic ? 'text-accent-text' : undefined}>
                                        {recipe.isPublic
                                            ? tVisibility('statePublic')
                                            : tVisibility('statePrivate')}
                                    </span>
                                </p>
                            </div>

                            {/* Wraps under the title on a phone rather than
                                squeezing five actions into a row that is
                                already carrying a thumbnail. */}
                            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                <RecipeRowActions
                                    recipeId={recipe.id}
                                    title={recipe.title}
                                    locale={locale}
                                    isPublic={recipe.isPublic}
                                    url={`${getSiteUrl()}/${locale}/recipe/${recipe.slug}`}
                                    shareUrl={
                                        recipe.shareToken
                                            ? shareUrl(getSiteUrl(), locale, recipe.shareToken)
                                            : null
                                    }
                                />
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

            {/* When the scheduled backup last ran. Nothing said so before;
                a backup failing for a month looked the same as one that ran. */}
            <p className="mt-10 mb-2 text-sm text-muted">
                {backup.lastRunAt
                    ? t('lastBackup', {
                        date: formatDate(backup.lastRunAt, locale),
                        result: backup.lastResult ?? '',
                    })
                    : t('noBackupYet')}
            </p>
            <BackupPanel />
        </main>
    );
}
