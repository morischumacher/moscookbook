import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import ReactMarkdown from 'react-markdown';
import { Link } from '@/i18n/routing';
import Logo from '@/components/brand/Logo';
import ShareButton from '@/components/recipe/ShareButton';
import ShareLink from '@/components/recipe/ShareLink';
import { formatDate } from '@/lib/formatDate';

export interface PostRow {
    id: number;
    title: string;
    slug: string;
    body: string;
    imageUrl: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    shareToken: string | null;
    author: { name: string } | null;
    recipe: { title: string; slug: string } | null;
}

/**
 * One written entry, on its own page.
 *
 * The same component serves the private page and the shared one, exactly as
 * RecipeArticle does, so the two cannot drift apart into slightly different
 * renderings of the same thing.
 *
 * Markdown, rendered with the same library the recipe method uses. No editor
 * toolbar, no blocks, no rich text: the thing being written here is a few
 * paragraphs about a cake, and every format beyond Markdown is a format that
 * has to be migrated later.
 */
export default async function PostArticle({
    post,
    locale,
    mode,
    isAdmin,
    url,
    publicUrl,
}: {
    post: PostRow;
    locale: string;
    mode: 'private' | 'shared';
    isAdmin: boolean;
    url: string;
    publicUrl: string | null;
}) {
    const t = await getTranslations('Blog');


    // A draft has no date of its own yet, so it shows when it was started.
    const shown = post.publishedAt ?? post.createdAt;

    return (
        <article className="min-h-screen w-full bg-page pb-32">
            <header className="container mx-auto max-w-2xl px-4 pt-8 sm:px-8 sm:pt-16">
                <div className="hidden print:mb-6 print:block">
                    <Logo height={32} />
                </div>

                {/* The same scale as a recipe's title. These are the two article
                    pages of the site, at the same depth, and they were one step
                    apart for no reason anybody chose. */}
                <h1 className="mb-6 text-3xl font-extrabold leading-[1.12] tracking-tight text-ink sm:text-4xl">
                    {post.title}
                </h1>

                <div className="my-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-line py-4 text-sm font-medium uppercase tracking-widest text-muted">
                    <span>{formatDate(shown, locale)}</span>
                    {post.author && <span>• {post.author.name}</span>}
                    {post.publishedAt === null && <span>• {t('draft')}</span>}
                </div>

                {/* An entry attached to a recipe says so and links back. The
                    recipe page shows the same entry from the other side; this
                    is the only thing that tells a reader arriving here where it
                    belongs. */}
                {post.recipe && mode === 'private' && (
                    <p className="print:hidden mb-8 text-sm">
                        {t('belongsTo')}{' '}
                        <Link
                            href={`/recipe/${post.recipe.slug}`}
                            className="font-medium underline underline-offset-4"
                        >
                            {post.recipe.title}
                        </Link>
                    </p>
                )}

                {mode === 'private' && isAdmin && post.publishedAt !== null && (
                    <div className="print:hidden mb-8">
                        <ShareLink id={post.id} kind="post" initialUrl={publicUrl} locale={locale} />
                    </div>
                )}
            </header>

            {post.imageUrl && (
                <div className="container mx-auto max-w-2xl px-0 sm:px-8">
                    <div className="relative aspect-[3/2] w-full overflow-hidden border-y border-line bg-black/[0.04] dark:bg-white/[0.06] sm:rounded-lg sm:border">
                        <Image
                            src={post.imageUrl}
                            alt={post.title}
                            fill
                            sizes="(max-width: 640px) 100vw, 672px"
                            className="object-cover"
                        />
                    </div>
                </div>
            )}

            <div className="container mx-auto mt-10 max-w-2xl px-4 font-serif text-lg leading-relaxed sm:px-8">
                <div className="post-body">
                    <ReactMarkdown>{post.body}</ReactMarkdown>
                </div>

                <div className="print:hidden mt-12 flex flex-wrap items-center gap-6 border-t border-line pt-6">
                    <ShareButton
                        title={post.title}
                        // The public link when there is one, so it reaches
                        // somebody without an account. See ShareButton.
                        url={mode === 'shared' ? url : publicUrl ?? undefined}
                        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                    />
                </div>
            </div>
        </article>
    );
}
