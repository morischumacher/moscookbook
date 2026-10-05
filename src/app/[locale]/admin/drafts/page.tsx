import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import { Link } from '@/i18n/routing';
import FinishDraft from '@/components/recipe/FinishDraft';
import DeleteRecipeButton from '@/components/DeleteRecipeButton';
import { buttonSecondary, pageContainer } from '@/lib/ui';
import { formatDate } from '@/lib/formatDate';
import PageHeader from '@/components/admin/PageHeader';

/**
 * Recipes that have been imported and tidied but that nobody here has stood
 * behind yet.
 *
 * The state the inbox never had a name for. A capture is raw and its quality
 * varies wildly; a recipe in the list is one of ours. In between sits the
 * thing you actually have most of the time: a recipe from somewhere else,
 * cleaned up, formatted, and not yet cooked once in this kitchen.
 *
 * Its own page rather than a badge in the list, because the list is the answer
 * to "what shall I make" and a draft is not an answer to that question. Here
 * they are all together, which is also the only view from which "I have four
 * of these waiting" is visible at all.
 *
 * Deliberately plain. This is a holding area, not a shop window: title, when
 * it came in, where from, and the one button.
 */
export default async function DraftsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations('Drafts');

    const drafts: {
        id: number;
        title: string;
        slug: string;
        createdAt: Date;
        captures: { sourceUrl: string | null }[];
        images: { url: string }[];
    }[] = await prisma.recipe.findMany({
        where: { isDraft: true },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            title: true,
            slug: true,
            createdAt: true,
            captures: { select: { sourceUrl: true }, take: 1 },
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('title')} intro={t('intro')} />

            {drafts.length === 0 ? (
                <p className="font-serif text-muted">{t('none')}</p>
            ) : (
                <ul className="flex flex-col gap-4">
                    {drafts.map((draft) => {
                        const source = draft.captures[0]?.sourceUrl ?? null;
                        let from: string | null = null;
                        try {
                            if (source) from = new URL(source).hostname.replace(/^www\./, '');
                        } catch {
                            from = null;
                        }

                        return (
                            <li
                                key={draft.id}
                                className="flex flex-wrap items-center gap-4 rounded-xl border border-control p-4"
                            >
                                {draft.images[0] && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={draft.images[0].url}
                                        alt=""
                                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                                    />
                                )}

                                <div className="min-w-[12rem] flex-1">
                                    <Link
                                        href={`/recipe/${draft.slug}`}
                                        className="font-semibold underline-offset-4 hover:underline"
                                    >
                                        {draft.title}
                                    </Link>
                                    <p className="text-sm text-muted">
                                        {from
                                            ? t('addedFrom', {
                                                date: formatDate(draft.createdAt, locale),
                                                host: from,
                                            })
                                            : t('added', { date: formatDate(draft.createdAt, locale) })}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <Link
                                        href={`/admin/edit/${draft.id}`}
                                        className={buttonSecondary}
                                    >
                                        {t('edit')}
                                    </Link>
                                    <FinishDraft recipeId={draft.id} />
                                    <DeleteRecipeButton recipeId={draft.id} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}
