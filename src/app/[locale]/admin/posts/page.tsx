import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { aboutTitles, postAboutTitlesSelect } from '@/components/post/PostArticle';
import DeletePostButton from '@/components/post/DeletePostButton';
import { formatDate } from '@/lib/formatDate';
import { buttonPrimarySmall, pageContainer } from '@/lib/ui';
import PageHeader from '@/components/admin/PageHeader';
import ExampleButton from '@/components/admin/ExampleButton';
import { EXAMPLE_POST_SLUG } from '@/lib/examples';
import { stageOf } from '@/lib/shareStage';

const isExampleSlug = (slug: string) => (Object.values(EXAMPLE_POST_SLUG) as string[]).includes(slug);

interface AdminPostRow {
    id: number;
    title: string;
    slug: string;
    publishedAt: Date | null;
    createdAt: Date;
    shareToken: string | null;
    isPublic: boolean;
    recipes: { recipe: { title: string } }[];
    collections: { collection: { title: string } }[];
}

export default async function AdminPosts({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const t = await getTranslations('Blog');
    const tShare = await getTranslations('Share');

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
            isPublic: true,
            ...postAboutTitlesSelect,
        },
    });


    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('adminTitle')}>
                <Link href="/admin/posts/new" className={buttonPrimarySmall}>
                    {t('newPost')}
                </Link>
            </PageHeader>

            {posts.length === 0 ? (
                <div className="py-16 text-center">
                    <p className="text-muted">{t('empty')}</p>
                    <ExampleButton kind="post" />
                </div>
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
                                    {aboutTitles(post) && <span>• {aboutTitles(post)}</span>}
                                    {/* Who can read it, in the Share dialog's words; nothing
                                        when it is the household's, which most are. */}
                                    {(() => {
                                        const stage = stageOf({ isPublic: post.isPublic, linkUrl: post.shareToken });
                                        if (stage === 'household' || stage === 'admins') return null;
                                        return <span>• {stage === 'web' ? tShare('stageWeb') : tShare('stageLink')}</span>;
                                    })()}
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

            {/* Until there is one: the quickest way to learn the editor is a
                finished entry that uses all of it. */}
            {posts.length > 0 && !posts.some((post) => isExampleSlug(post.slug)) && (
                <div className="border-t border-line pt-2">
                    <ExampleButton kind="post" />
                </div>
            )}
        </main>
    );
}
