import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import ReactMarkdown from 'react-markdown';
import { Link } from '@/i18n/routing';
import Logo from '@/components/brand/Logo';
import ShareButton from '@/components/share/ShareButton';
import { formatDate } from '@/lib/formatDate';
import InlinePicture from '@/components/ui/InlinePicture';

export interface PostRow {
    id: number;
    title: string;
    slug: string;
    body: string;
    imageUrl: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    shareToken: string | null;
    /**
     * Whether this entry's own address answers without a session.
     *
     * Optional: the shared page at /p/[token] builds its own row and has no
     * business knowing, since a token is a different door. The blog page
     * requires it, and reads it before anything else.
     */
    isPublic?: boolean;
    author: { name: string } | null;
    recipes: { recipe: AboutRecipe }[];
    collections: { collection: AboutCollection }[];
}

export interface AboutRecipe {
    id: number;
    title: string;
    slug: string;
    isPublic: boolean;
    isDraft: boolean;
    images: { url: string }[];
}

export interface AboutCollection {
    id: number;
    title: string;
    slug: string;
    isPublic: boolean;
    imageUrl: string | null;
}

/**
 * What an entry is about, as every page that shows one reads it: the recipes
 * and collections in the order they were listed, with enough of each to draw
 * a small card and to decide who may see it.
 */
export const postAboutSelect = {
    recipes: {
        orderBy: { position: 'asc' as const },
        select: {
            recipe: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    isPublic: true,
                    isDraft: true,
                    images: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
                },
            },
        },
    },
    collections: {
        orderBy: { position: 'asc' as const },
        select: { collection: { select: { id: true, title: true, slug: true, isPublic: true, imageUrl: true } } },
    },
};

/** Just the names, for a line in a list. */
export const postAboutTitlesSelect = {
    recipes: { orderBy: { position: 'asc' as const }, select: { recipe: { select: { title: true } } } },
    collections: { orderBy: { position: 'asc' as const }, select: { collection: { select: { title: true } } } },
};

export function aboutTitles(post: {
    recipes: { recipe: { title: string } }[];
    collections: { collection: { title: string } }[];
}): string {
    return [...post.recipes.map((row) => row.recipe.title), ...post.collections.map((row) => row.collection.title)].join(', ');
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


    const visible = (item: { isPublic: boolean }) => mode === 'private' || item.isPublic;
    const about = [
        ...post.recipes
            .map((row) => row.recipe)
            .filter((recipe) => !recipe.isDraft && visible(recipe))
            .map((recipe) => ({
                kind: 'recipe' as const,
                href: `/recipe/${recipe.slug}`,
                title: recipe.title,
                image: recipe.images[0]?.url ?? null,
            })),
        ...post.collections
            .map((row) => row.collection)
            .filter(visible)
            .map((collection) => ({
                kind: 'collection' as const,
                href: `/collections/${collection.slug}`,
                title: collection.title,
                image: collection.imageUrl,
            })),
    ];

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


                {/*
                    The share panel that used to sit here is gone. It offered
                    one of the three stages — make a secret link, withdraw it —
                    with no way to say "put this on the web" and no way to see
                    where the entry stood. The Share button below opens the
                    control that says all three.
                */}
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
                    <ReactMarkdown components={{ img: InlinePicture }}>{post.body}</ReactMarkdown>
                </div>

                {/* What the entry is about. At the end, where a reader who
                    wants to cook it is when they finish reading, and as cards
                    rather than a line of links, because a picture is how a
                    recipe is recognised. On a shared or public page only what
                    is itself public is listed: an entry going on the web does
                    not take a private recipe's name with it. */}
                {about.length > 0 && (
                    <section className="print:hidden mt-12 border-t border-line pt-6 [font-family:var(--font-sans)]">
                        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
                            {t('aboutTitle')}
                        </h2>
                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {about.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className="group flex items-center gap-3 rounded-xl border border-line p-2 pr-4 transition-colors hover:border-ink"
                                    >
                                        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface">
                                            {item.image && (
                                                <Image src={item.image} alt="" fill sizes="64px" className="object-cover" />
                                            )}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-[11px] font-semibold uppercase tracking-widest text-faint">
                                                {item.kind === 'recipe' ? t('aboutRecipe') : t('aboutCollection')}
                                            </span>
                                            <span className="block font-bold leading-tight group-hover:underline">
                                                {item.title}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <div className="print:hidden mt-12 flex flex-wrap items-center gap-6 border-t border-line pt-6">
                    <ShareButton
                        id={post.id}
                        kind="post"
                        title={post.title}
                        locale={locale}
                        isPublic={Boolean(post.isPublic)}
                        linkUrl={publicUrl}
                        ownUrl={url}
                        // An unfinished entry cannot go on the open web, and
                        // the route refuses it — so the stages are not offered
                        // for one either.
                        mayChange={mode === 'private' && isAdmin && post.publishedAt !== null}
                        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                    />
                </div>
            </div>
        </article>
    );
}
