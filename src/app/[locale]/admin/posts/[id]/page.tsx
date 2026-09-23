import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import { collectionOptions, recipeOptions } from '@/lib/pickOptions';
import PostForm from '@/components/post/PostForm';

interface PostRecord {
    id: number;
    title: string;
    slug: string;
    body: string;
    imageUrl: string | null;
    recipes: { recipeId: number }[];
    collections: { collectionId: number }[];
    publishedAt: Date | null;
}

export default async function EditPost({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const postId = Number.parseInt(id, 10);
    if (Number.isNaN(postId)) notFound();

    const t = await getTranslations('Blog');

    // Annotated for the same reason as everywhere else in this codebase: the
    // generated client is not available at type-check time.
    const [post, recipes, collections] = await Promise.all([
        prisma.post.findUnique({
            where: { id: postId },
            select: {
                id: true,
                title: true,
                slug: true,
                body: true,
                imageUrl: true,
                recipes: { orderBy: { position: 'asc' }, select: { recipeId: true } },
                collections: { orderBy: { position: 'asc' }, select: { collectionId: true } },
                publishedAt: true,
            },
        }) as Promise<PostRecord | null>,
        recipeOptions(),
        collectionOptions(),
    ]);

    if (!post) notFound();

    return (
        <main className="container mx-auto max-w-2xl px-4 pb-32 md:px-8">
            <h1 className="border-b border-line pb-6 pt-12 text-3xl font-extrabold tracking-tight sm:pt-16 sm:text-4xl">
                {t('editPost')}
            </h1>

            <div className="pt-8">
                <PostForm
                    initial={{
                        id: post.id,
                        title: post.title,
                        slug: post.slug,
                        body: post.body,
                        imageUrl: post.imageUrl ?? '',
                        recipeIds: post.recipes.map((row) => row.recipeId),
                        collectionIds: post.collections.map((row) => row.collectionId),
                        published: post.publishedAt !== null,
                    }}
                    recipes={recipes}
                    collections={collections}
                />
            </div>
        </main>
    );
}
