import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import PostArticle, { postAboutSelect, type PostRow } from '@/components/post/PostArticle';
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
    isPublic: true,
    author: { select: { name: true } },
    ...postAboutSelect,
} as const;

const loadPost = cache(async (slug: string): Promise<PostRow | null> => {
    return prisma.post.findUnique({ where: { slug }, select: postSelect });
});

/**
 * What a crawler or a link preview is told.
 *
 * A private entry gets a title for the browser tab and nothing else: neither
 * can get past the login, and `index: false` keeps the address out of a
 * search result that would only ever lead to a sign-in form.
 *
 * A **public** one is a page on the web like any other, so it gets the card —
 * the same rule the recipe page has followed since recipes could be
 * published, and now the same because an entry can be.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const post = await loadPost(slug);

    if (!post || !post.isPublic || post.publishedAt === null) {
        return {
            title: post ? `${post.title} — mo'scookbook` : "mo'scookbook",
            robots: { index: false, follow: false },
        };
    }

    return {
        title: `${post.title} — mo'scookbook`,
        openGraph: {
            title: post.title,
            type: 'article',
            ...(post.imageUrl ? { images: [{ url: post.imageUrl }] } : {}),
        },
    };
}

export default async function BlogPostPage({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}) {
    const { slug, locale } = await params;

    const post = await loadPost(slug);
    const user = await getCurrentUser();

    /*
     * One of the three pages whose access the proxy does not decide.
     *
     * accessRules lets `/blog/<slug>` through because only the row knows
     * whether it is public, so the check lives here and has to be the first
     * thing that happens — the same arrangement the recipe page has had since
     * recipes could be published, and the same danger: forget it and every
     * entry is on the open web.
     *
     * A missing entry and a private one look identical to somebody with no
     * account, deliberately. Answering 404 for one and "sign in" for the
     * other would let anybody with a word list discover which entries exist,
     * one guess at a time. Both go to the login form carrying where they were
     * headed, so following a link and signing in still lands on the entry.
     *
     * An unpublished entry is never public whatever `isPublic` says: a draft
     * is for whoever is writing it.
     */
    const readable = Boolean(post) && post!.isPublic && post!.publishedAt !== null;

    if (!user && !readable) {
        const next = encodeURIComponent(`/${locale}/blog/${slug}`);
        redirect(`/${locale}/login?next=${next}`);
    }

    if (!post) notFound();

    // A draft is for whoever is writing it. Not a 403: somebody who is not an
    // admin has no business knowing that an unfinished entry exists at this
    // address at all.
    if (post.publishedAt === null && !user?.admin) notFound();

    return (
        <PostArticle
            post={post}
            locale={locale}
            mode={user ? 'private' : 'shared'}
            isAdmin={Boolean(user?.admin)}
            url={`${getSiteUrl()}/${locale}/blog/${post.slug}`}
            // Only an admin is given the secret link: see the collection page.
            publicUrl={
                user?.admin && post.shareToken ? shareUrl(getSiteUrl(), locale, post.shareToken, 'post') : null
            }
        />
    );
}
