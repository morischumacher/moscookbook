import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import DeleteRecipeButton from '@/components/DeleteRecipeButton';
import RecipeRowActions from '@/components/admin/RecipeRowActions';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';
import { stageOf } from '@/lib/shareStage';
import BackupPanel from '@/components/admin/BackupPanel';
import ForeignImport from '@/components/admin/ForeignImport';
import { backupStatus } from '@/lib/backupStatus';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall, pageContainer } from '@/lib/ui';
import PageHeader from '@/components/admin/PageHeader';
import { searchableText } from '@/lib/searchText';
import {
    ADMIN_PAGE_SIZE,
    ADMIN_SHOWS,
    ADMIN_SORTS,
    listHref,
    readListQuery,
    showWhere,
    sortOrder,
} from '@/lib/adminRecipeList';

interface AdminRecipeRow {
    id: number;
    title: string;
    slug: string;
    category: string | null;
    views: number;
    isPublic: boolean;
    shareToken: string | null;
    onlyMe: boolean;
    images: { url: string }[];
}

export default async function AdminDashboard({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { locale } = await params;
    const query = readListQuery(await searchParams);
    const [t, tCategory, backup] = await Promise.all([
        getTranslations('Admin'),
        getTranslations('Categories'),
        backupStatus(),
    ]);
    const tShare = await getTranslations('Share');

    /*
     * Searched, filtered, sorted and in pages.
     *
     * It was the newest hundred and nothing else: the hundred-and-first
     * recipe could not be reached from here at all, and the backup below the
     * list moved further down with every recipe. Drafts have their own page
     * and are not repeated here.
     */
    const words = searchableText(query.q);
    const where = {
        isDraft: false,
        ...showWhere(query.show),
        ...(query.q
            ? {
                OR: [
                    { title: { contains: query.q, mode: 'insensitive' as const } },
                    // The search column also knows ae/oe/ue spellings and the
                    // translated title.
                    ...(words ? [{ searchTitle: { contains: words } }] : []),
                ],
            }
            : {}),
    };
    const [total, all] = await Promise.all([prisma.recipe.count({ where }), prisma.recipe.count({ where: { isDraft: false } })]);
    const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    const page = Math.min(query.page, pages);

    const recipes: AdminRecipeRow[] = await prisma.recipe.findMany({
        where,
        orderBy: sortOrder(query.sort),
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        select: {
            id: true,
            title: true,
            slug: true,
            category: true,
            views: true,
            isPublic: true,
            shareToken: true,
            onlyMe: true,
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

            {all > 0 && (
                <div className="mb-2 space-y-3">
                    {/* A plain form: works before any script has loaded, and
                        the address is the state. */}
                    <form action={`/${locale}/admin`} className="flex gap-2">
                        <input
                            type="search"
                            name="q"
                            defaultValue={query.q}
                            placeholder={t('listSearch')}
                            aria-label={t('listSearch')}
                            className="min-w-0 flex-1 rounded-lg border border-control bg-transparent px-3 py-2 outline-none focus:border-ink"
                        />
                        {query.sort !== 'new' && <input type="hidden" name="sort" value={query.sort} />}
                        {query.show !== 'all' && <input type="hidden" name="show" value={query.show} />}
                    </form>

                    <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {ADMIN_SHOWS.map((show) => (
                            <Link
                                key={show}
                                href={listHref(query, { show })}
                                aria-current={query.show === show ? 'true' : undefined}
                                className={query.show === show ? 'font-semibold text-ink' : 'text-muted hover:text-ink'}
                            >
                                {t(`listShow.${show}`)}
                            </Link>
                        ))}
                        </div>
                        <span aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {ADMIN_SORTS.map((sort) => (
                            <Link
                                key={sort}
                                href={listHref(query, { sort })}
                                aria-current={query.sort === sort ? 'true' : undefined}
                                className={query.sort === sort ? 'font-semibold text-ink' : 'text-muted hover:text-ink'}
                            >
                                {t(`listSort.${sort}`)}
                            </Link>
                        ))}
                        </div>
                    </div>

                    <p className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                        <span>
                            {query.q || query.show !== 'all'
                                ? t('listCountFiltered', { count: total, all })
                                : t('listCount', { count: total })}
                        </span>
                        <a href="#backup" className="underline underline-offset-4">{t('toBackup')}</a>
                    </p>
                </div>
            )}

            {recipes.length === 0 ? (
                <p className="py-20 text-center text-muted">
                    {all === 0 ? t('noRecipes') : t('listNothingFound')}
                    {all > 0 && (
                        <>
                            {' '}
                            <Link href="/admin" className="underline underline-offset-4">{t('listReset')}</Link>
                        </>
                    )}
                </p>
            ) : (
                <ul className="divide-y divide-line">
                    {recipes.map((recipe) => (
                        // Thumbnail and title on one line, the actions on the
                        // next on a phone — side by side only once there is
                        // room. Squeezed into one row, the actions took all
                        // of it and the title was truncated to nothing.
                        <li key={recipe.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
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

                            <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
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
                                    {/* Who can see it, here rather than beside the
                                        buttons (on a phone that made every row
                                        three lines long) — and only when it is
                                        not the household, which most are. */}
                                    {(() => {
                                        const stage = stageOf({ isPublic: recipe.isPublic, linkUrl: recipe.shareToken, onlyMe: recipe.onlyMe });
                                        if (stage === 'household') return null;
                                        const label = { admins: tShare('stageAdmins'), link: tShare('stageLink'), web: tShare('stageWeb') }[stage];
                                        return (
                                            <span className="text-accent-text">
                                                {' · '}
                                                {label}
                                            </span>
                                        );
                                    })()}
                                </p>
                            </div>

                            {/* Wraps under the title on a phone rather than
                                squeezing five actions into a row that is
                                already carrying a thumbnail. */}
                            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 pl-16 text-sm sm:w-auto sm:pl-0">
                                <RecipeRowActions
                                    showStage={false}
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
                                    onlyMe={recipe.onlyMe}
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

            {pages > 1 && (
                <nav aria-label={t('listPages')} className="mt-6 flex items-center justify-between text-sm">
                    {page > 1 ? (
                        <Link href={listHref(query, { page: page - 1 })} className="underline underline-offset-4">
                            {t('listPrevious')}
                        </Link>
                    ) : (
                        <span />
                    )}
                    <span className="text-muted">{t('listPage', { page, pages })}</span>
                    {page < pages ? (
                        <Link href={listHref(query, { page: page + 1 })} className="underline underline-offset-4">
                            {t('listNext')}
                        </Link>
                    ) : (
                        <span />
                    )}
                </nav>
            )}

            {/* When the scheduled backup last ran. Nothing said so before;
                a backup failing for a month looked the same as one that ran. */}
            <p id="backup" className="mt-10 mb-2 scroll-mt-24 text-sm text-muted">
                {backup.lastRunAt
                    ? t('lastBackup', {
                        date: formatDate(backup.lastRunAt, locale),
                        result: backup.lastResult ?? '',
                    })
                    : t('noBackupYet')}
            </p>
            <BackupPanel />
            <ForeignImport />
        </main>
    );
}
