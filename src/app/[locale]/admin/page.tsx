import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import DeleteRecipeButton from '@/components/DeleteRecipeButton';

interface AdminRecipeRow {
    id: number;
    title: string;
    slug: string;
    category: string | null;
    views: number;
    images: { url: string }[];
}

export default async function AdminDashboard() {
    const t = await getTranslations('Admin');
    const tCategory = await getTranslations('Categories');

    const recipes: AdminRecipeRow[] = await prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            title: true,
            slug: true,
            category: true,
            views: true,
            images: { orderBy: { id: 'asc' }, take: 1, select: { url: true } },
        },
    });

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 md:px-8">
            <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--color-border)] pb-6 pt-12 sm:pt-16">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('dashboard')}</h1>
                <Link
                    href="/admin/create"
                    className="rounded-full bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)]"
                >
                    {t('createNew')}
                </Link>
            </header>

            {recipes.length === 0 ? (
                <p className="py-20 text-center text-gray-500">{t('noRecipes')}</p>
            ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                    {recipes.map((recipe) => (
                        <li key={recipe.id} className="flex items-center gap-4 py-4">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--color-border)] bg-black/[0.04] dark:bg-white/[0.06]">
                                {recipe.images[0] && (
                                    <Image
                                        src={recipe.images[0].url}
                                        alt=""
                                        fill
                                        sizes="48px"
                                        className="object-cover"
                                    />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/recipe/${recipe.slug}`}
                                    className="block truncate font-medium underline-offset-4 hover:underline"
                                >
                                    {recipe.title}
                                </Link>
                                <p className="text-xs uppercase tracking-widest text-gray-500">
                                    {recipe.category
                                        ? tCategory.has(recipe.category)
                                            ? tCategory(recipe.category)
                                            : recipe.category
                                        : '—'}
                                    {' · '}
                                    {t('viewCount', { count: recipe.views })}
                                </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-3 text-sm">
                                <Link
                                    href={`/admin/edit/${recipe.id}`}
                                    className="underline underline-offset-4 hover:text-gray-500"
                                >
                                    {t('edit')}
                                </Link>
                                <DeleteRecipeButton recipeId={recipe.id} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
