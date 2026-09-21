import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import DeletePostButton from '@/components/post/DeletePostButton';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall, pageContainer, pageHeading, pageTop } from '@/lib/ui';

interface AdminPostRow {
    id: number;
    title: string;
    slug: string;
    publishedAt: Date | null;
    createdAt: Date;
    shareToken: string | null;
    recipe: { title: string } | null;
}

export default async function AdminPosts({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const t = await getTranslations('Blog');

    const posts: AdminPostRow[] = await prisma.post.findMany({
        orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: 200,
        select: {
            id: true,
            title: true,
            slug: true,
            publishedAt: true,
            createdAt: true,
            shareToken: true,
            recipe: { select: { title: true } },
        },
    });


    return (
        <main className={`${pageContainer} pb-32`}>
            <header className={`flex flex-wrap items-baseline justify-between gap-4 ${pageTop} ${pageHeading}`}>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('adminTitle')}</h1>
                <Link
                    href="/admin/posts/new"
                    className={buttonPrimarySmall}
                >
                    {t('newPost')}
                </Link>
            </header>

            {posts.length === 0 ? (
                <p className="py-20 text-center text-muted">{t('empty')}</p>
            ) : (
                <ul className="divide-y divide-line">
                    {posts.map((post) => (
                        <li key={post.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-2 py-5">
                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/admin/posts/${post.id}`}
                                    className="text-lg font-bold tracking-tight underline-offset-4 hover:underline"
                                >
                                    {post.title}
                                </Link>

                                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-widest text-muted">
                                    <span>{formatDate(post.publishedAt ?? post.createdAt, locale, 'short')}</span>
                                    <span>• {post.publishedAt ? t('published') : t('draft')}</span>
                                    {post.recipe && <span>• {post.recipe.title}</span>}
                                    {post.shareToken && <span>• {t('hasPublicLink')}</span>}
                                </p>
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                                <Link href={`/blog/${post.slug}`} className="text-muted underline underline-offset-4">
                                    {t('view')}
                                </Link>
                                <DeletePostButton postId={post.id} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
