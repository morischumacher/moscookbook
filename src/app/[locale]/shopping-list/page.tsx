import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { buildShoppingList, type RecipeForList } from '@/lib/shoppingList';
import ShoppingListView from '@/components/shopping/ShoppingListView';

interface RecipeRow {
    id: number;
    title: string;
    slug: string;
    servings: number | null;
    ingredients: {
        quantity: number | null;
        quantityMax: number | null;
        unit: string | null;
        name: string;
        raw: string;
    }[];
}

/** "3,1,2" -> [3, 1, 2], ignoring anything that is not a plausible id. */
function parseIds(value: string | string[] | undefined): number[] {
    if (typeof value !== 'string') return [];

    const ids = value
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0);

    return [...new Set(ids)].slice(0, 50);
}

export default async function ShoppingListPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
    params: Promise<{ locale: string }>;
}) {
    const t = await getTranslations('ShoppingList');
    const { r } = await searchParams;
    const ids = parseIds(r);

    const recipes: RecipeRow[] =
        ids.length === 0
            ? []
            : await prisma.recipe.findMany({
                where: { id: { in: ids } },
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    servings: true,
                    ingredients: {
                        orderBy: { position: 'asc' },
                        select: {
                            quantity: true,
                            quantityMax: true,
                            unit: true,
                            name: true,
                            raw: true,
                        },
                    },
                },
            });

    // Keep the order the cook picked them in, not the order the database returns.
    const ordered = ids
        .map((id) => recipes.find((recipe) => recipe.id === id))
        .filter((recipe): recipe is RecipeRow => recipe !== undefined);

    const forList: RecipeForList[] = ordered.map((recipe) => ({
        recipeId: recipe.id,
        title: recipe.title,
        slug: recipe.slug,
        servings: recipe.servings,
        ingredients: recipe.ingredients,
    }));

    const items = buildShoppingList(forList);

    return (
        <main className="container mx-auto max-w-2xl px-4 pb-32 md:px-8">
            <header className="border-b border-line pb-6 pt-12 sm:pt-16">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                {ordered.length > 0 && (
                    <p className="mt-3 text-sm text-muted">
                        {t('fromRecipes', { count: ordered.length })}
                    </p>
                )}
            </header>

            {items.length === 0 ? (
                <div className="py-20 text-center">
                    <p className="text-muted">{t('empty')}</p>
                    <Link
                        href="/"
                        className="mt-4 inline-block text-sm underline underline-offset-4"
                    >
                        {t('browseRecipes')}
                    </Link>
                </div>
            ) : (
                <ShoppingListView
                    items={items}
                    recipes={ordered.map((recipe) => ({
                        recipeId: recipe.id,
                        title: recipe.title,
                        slug: recipe.slug,
                    }))}
                />
            )}
        </main>
    );
}
