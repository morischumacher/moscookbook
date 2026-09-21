import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { excerptOf } from '@/lib/postSchema';
import { buildTsQuery } from '@/lib/searchText';
import { formatDate } from '@/lib/formatDate';

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

interface PostListRow {
    id: number;
    title: string;
    slug: string;
    body: string;
    imageUrl: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    recipe: { title: string; slug: string } | null;
}

/**
 * Everything that has been written, newest first.
 *
 * Notes attached to a recipe appear here alongside standalone entries. They
 * are the same thing written on different days, and separating them into two
 * lists would mean deciding, for every entry, which list it is "really" in —
 * a question with no answer and an interface to maintain either way. An entry
 * that belongs to a recipe simply says so.
 *
 * Drafts are shown to an admin and to nobody else, marked as drafts, so that
 * the list is also the place unfinished writing can be found again.
 */
export default async function BlogIndex({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ search?: string }>;
}) {
    const { locale } = await params;
    const search = (await searchParams).search?.trim() ?? '';
    const t = await getTranslations('Blog');
    const user = await getCurrentUser();
    const isAdmin = Boolean(user?.admin);

    // Full text, the same German configuration and the same weighting as the
    // recipes: an entry *called* Zwetschgen outranks one that merely mentions
    // them. The ids come back ranked and the read below is ordered by that
    // rank rather than by date.
    let matchedIds: number[] | null = null;

    if (search) {
        const tsquery = buildTsQuery(search);

        if (tsquery === null) {
            matchedIds = [];
        } else {
            const ranked: { id: number }[] = await prisma.$queryRaw<{ id: number }[]>`
                SELECT "id"
                FROM "Post"
                WHERE "searchVector" @@ to_tsquery('german', ${tsquery})
                ORDER BY ts_rank("searchVector", to_tsquery('german', ${tsquery})) DESC,
                         "createdAt" DESC
            `;
            matchedIds = ranked.map((row) => row.id);
        }
    }

    const posts: PostListRow[] = await prisma.post.findMany({
        where: {
            ...(isAdmin ? {} : { publishedAt: { not: null } }),
            ...(matchedIds === null ? {} : { id: { in: matchedIds } }),
        },
        // Nulls first puts an admin's unfinished drafts at the top, where they
        // are a to-do list rather than something buried under last year.
        orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: 100,
        select: {
            id: true,
            title: true,
            slug: true,
            body: true,
            imageUrl: true,
            publishedAt: true,
            createdAt: true,
            recipe: { select: { title: true, slug: true } },
        },
    });

    // Relevance beats date when somebody searched, which means reordering here
    // rather than in the query: `in` does not preserve the order it was given.
    if (matchedIds !== null) {
        const rank = new Map(matchedIds.map((id, index) => [id, index]));
        posts.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }


    return (
        <main className="container mx-auto max-w-2xl px-4 pb-32 sm:px-8">
            <header className="border-b border-line pb-6 pt-12 sm:pt-16">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                <p className="mt-3 font-serif text-lg leading-relaxed text-muted">{t('intro')}</p>

                <form action="" className="mt-6 flex items-center gap-3 border-b border-line pb-2">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                        className="shrink-0 text-faint"
                    >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.6-3.6" />
                    </svg>

                    <label htmlFor="blog-search" className="sr-only">
                        {t('searchLabel')}
                    </label>
                    {/* A plain GET form, so a search is a URL somebody can keep
                        and the page needs no JavaScript to answer it. */}
                    <input
                        id="blog-search"
                        name="search"
                        type="search"
                        defaultValue={search}
                        placeholder={t('searchPlaceholder')}
                        className="w-full bg-transparent py-1 text-base outline-none placeholder:text-faint"
                    />
                </form>
            </header>

            {posts.length === 0 ? (
                <p className="py-20 text-center text-muted">
                    {search ? t('noResults', { search }) : t('empty')}
                </p>
            ) : (
                <ul className="divide-y divide-line">
                    {posts.map((post) => (
                        <li key={post.id}>
                            <Link
                                href={`/blog/${post.slug}`}
                                className="group flex flex-row items-start justify-between gap-5 py-7 sm:py-8"
                            >
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-widest text-muted">
                                        <span>{formatDate(post.publishedAt ?? post.createdAt, locale)}</span>
                                        {post.publishedAt === null && <span>• {t('draft')}</span>}
                                        {post.recipe && <span>• {post.recipe.title}</span>}
                                    </p>

                                    <h2 className="mb-2 text-xl font-bold leading-tight tracking-tight underline-offset-4 group-hover:underline sm:text-2xl">
                                        {post.title}
                                    </h2>

                                    <p className="font-serif text-base leading-relaxed text-muted">
                                        {excerptOf(post.body)}
                                    </p>
                                </div>

                                {post.imageUrl && (
                                    <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-black/[0.04] transition-transform duration-200 group-hover:scale-[1.02] dark:bg-white/[0.06] sm:w-32">
                                        <Image
                                            src={post.imageUrl}
                                            alt=""
                                            fill
                                            sizes="128px"
                                            className="object-cover"
                                        />
                                    </div>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
