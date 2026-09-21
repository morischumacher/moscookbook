import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import DeletePostButton from '@/components/post/DeletePostButton';

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

    const dateFormatter = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 md:px-8">
            <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-6 pt-12 sm:pt-16">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('adminTitle')}</h1>
                <Link
                    href="/admin/posts/new"
                    className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-page"
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
                                    <span>{dateFormatter.format(post.publishedAt ?? post.createdAt)}</span>
                                    <span>• {post.publishedAt ? t('published') : t('draft')}</span>
                                    {post.recipe && <span>• {post.recipe.title}</span>}
                                    {post.shareToken && <span>• {t('hasPublicLink')}</span>}
                                </p>
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                                <Link href={`/blog/${post.slug}`} className="text-muted underline underline-offset-4">
                                    {t('view')}
                                </Link>
                                <DeletePostButton postId={post.id} title={post.title} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
