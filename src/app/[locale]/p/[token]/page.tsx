import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import PostArticle, { type PostRow } from '@/components/post/PostArticle';
import { excerptOf } from '@/lib/postSchema';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';

/**
 * An entry someone was given a link to. The recipe side of this is
 * /[locale]/r/[token]; everything said there applies here.
 */
const loadShared = cache(async (token: string): Promise<PostRow | null> => {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;

    return prisma.post.findUnique({
        where: { shareToken: token },
        select: {
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
        },
    });
});

export async function generateMetadata({
    params,
}: {
    params: Promise<{ token: string; locale: string }>;
}): Promise<Metadata> {
    const { token, locale } = await params;
    const post = await loadShared(token);

    if (!post || post.publishedAt === null) {
        return { title: "mo'scookbook", robots: { index: false, follow: false } };
    }

    const image = post.imageUrl ?? '/og-default.png';
    const description = excerptOf(post.body, 160);

    return {
        title: `${post.title} — mo'scookbook`,
        description,
        // Secret link, so not something a search engine should hold. The
        // preview cards still work: messaging apps fetch the page when a link
        // is pasted, they do not consult an index.
        robots: { index: false, follow: false, nocache: true },
        openGraph: {
            type: 'article',
            siteName: "mo'scookbook",
            locale,
            title: post.title,
            description,
            publishedTime: post.publishedAt.toISOString(),
            url: shareUrl(getSiteUrl(), locale, token, 'post'),
            images: [{ url: image, alt: post.title, width: 1200, height: 630 }],
        },
        twitter: {
            card: 'summary_large_image',
            title: post.title,
            description,
            images: [image],
        },
    };
}

export default async function SharedPostPage({
    params,
}: {
    params: Promise<{ token: string; locale: string }>;
}) {
    const { token, locale } = await params;

    const post = await loadShared(token);

    // A token on an entry that has since been put back to draft stops working.
    // Unpublishing has to mean unpublished, or "draft" is only a label.
    if (!post || post.publishedAt === null) notFound();

    const tShare = await getTranslations('Share');

    return (
        <>
            <p className="print:hidden border-b border-line px-4 py-3 text-center text-sm text-muted">
                {tShare('sharedPostNotice')}{' '}
                <Link href="/login" className="underline underline-offset-4">
                    {tShare('sharedLogin')}
                </Link>
            </p>

            <PostArticle
                post={post}
                locale={locale}
                mode="shared"
                isAdmin={false}
                url={shareUrl(getSiteUrl(), locale, token, 'post')}
                publicUrl={null}
            />
        </>
    );
}
