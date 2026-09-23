import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import { coursesFromRecipes } from '@/lib/menu';
import MenuForm from '@/components/menu/MenuForm';
import PageHeader from '@/components/admin/PageHeader';
import { pageContainer } from '@/lib/ui';

async function recipeChoices() {
    return prisma.recipe.findMany({ where: { isDraft: false }, orderBy: { title: 'asc' }, select: { id: true, title: true } });
}

/**
 * A new menu — empty, or started from a collection (`?collection=<id>`),
 * whose recipes are sorted into courses as a first guess.
 */
export default async function NewMenuPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ collection?: string }>;
}) {
    const [{ locale }, { collection: rawCollection }] = await Promise.all([params, searchParams]);
    const collectionId = Number.parseInt(rawCollection ?? '', 10);

    const [t, recipes, collection] = await Promise.all([
        getTranslations('Menus'),
        recipeChoices(),
        Number.isInteger(collectionId)
            ? prisma.collection.findUnique({
                  where: { id: collectionId },
                  select: {
                      title: true,
                      description: true,
                      recipes: { orderBy: { position: 'asc' }, select: { recipe: { select: { id: true, title: true, category: true } } } },
                  },
              })
            : null,
    ]);

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('newTitle')} />
            <MenuForm
                recipes={recipes}
                initial={{
                    title: collection?.title ?? '',
                    occasion: '',
                    date: '',
                    guests: null,
                    style: 'casual',
                    intro: '',
                    courses: collection
                        ? coursesFromRecipes(collection.recipes.map((row) => row.recipe), locale === 'de' ? 'de' : 'en')
                        : [],
                }}
            />
        </main>
    );
}
