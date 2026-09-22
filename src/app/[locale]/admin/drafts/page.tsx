import { getTranslations } from 'next-intl/server';

import prisma from '@/lib/prisma';
import { Link } from '@/i18n/routing';
import FinishDraft from '@/components/recipe/FinishDraft';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';
import { formatDate } from '@/lib/formatDate';

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

    /*
     * No `mayFinish` any more. The page used to sit at /drafts, outside the
     * admin, so it had to work out for itself whether the person reading it
     * was allowed to finish a draft — and for everybody else it drew a list
     * with no button, which is a room with nothing in it. Under /admin the
     * layout has already answered that question, and everyone who gets here
     * can finish.
     */
    // Annotated rather than inferred: without a generated Prisma client this
    // comes back as `any` and nothing below would be checked.
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
            // Where it came from, which is most of what tells two drafts apart
            // three weeks later.
            captures: { select: { sourceUrl: true }, take: 1 },
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1
                className={`mb-2 text-3xl font-extrabold tracking-tight sm:text-4xl ${pageTop} ${pageHeading}`}
            >
                {t('title')}
            </h1>
            <p className="mb-10 font-serif text-muted">{t('intro')}</p>

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

                                <FinishDraft recipeId={draft.id} />
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}
