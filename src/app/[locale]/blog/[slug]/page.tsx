import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import PostArticle, { type PostRow } from '@/components/post/PostArticle';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';

const postSelect = {
    id: true,
    title: true,
    slug: true,
    body: true,
    imageUrl: true,
    publishedAt: true,
    createdAt: true,
    shareToken: true,
    author: { select: { name: true } },
    recipe: { select: { title: true, slug: true } },
} as const;

const loadPost = cache(async (slug: string): Promise<PostRow | null> => {
    return prisma.post.findUnique({ where: { slug }, select: postSelect });
});

/**
 * Behind the login, so there is nothing here for a crawler or a link preview.
 * A title for the browser tab and nothing else; the public face of an entry is
 * /p/[token].
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const post = await loadPost(slug);

    return {
        title: post ? `${post.title} — mo'scookbook` : "mo'scookbook",
        robots: { index: false, follow: false },
    };
}

export default async function BlogPostPage({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}) {
    const { slug, locale } = await params;

    const post = await loadPost(slug);
    if (!post) notFound();

    const user = await getCurrentUser();

    // A draft is for whoever is writing it. Not a 403: somebody who is not an
    // admin has no business knowing that an unfinished entry exists at this
    // address at all.
    if (post.publishedAt === null && !user?.admin) notFound();

    return (
        <PostArticle
            post={post}
            locale={locale}
            mode="private"
            isAdmin={Boolean(user?.admin)}
            url={`${getSiteUrl()}/${locale}/blog/${post.slug}`}
            publicUrl={
                post.shareToken ? shareUrl(getSiteUrl(), locale, post.shareToken, 'post') : null
            }
        />
    );
}
