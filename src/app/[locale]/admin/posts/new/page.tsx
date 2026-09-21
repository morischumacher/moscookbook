import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import PostForm from '@/components/post/PostForm';

/**
 * A new entry.
 *
 * `?recipeId=` pre-selects a recipe, which is how the "write a note" link on a
 * recipe page arrives here. It is only a preselection: the dropdown still
 * opens on a list with "no recipe" in it, and an entry never needs one.
 */
export default async function NewPost({
    searchParams,
}: {
    searchParams: Promise<{ recipeId?: string }>;
}) {
    const { recipeId } = await searchParams;
    const t = await getTranslations('Blog');

    // Annotated rather than inferred: without a generated Prisma client this
    // comes back as `any`, and the callback below then has no type to check.
    const recipes: { id: number; title: string }[] = await prisma.recipe.findMany({
        orderBy: { title: 'asc' },
        select: { id: true, title: true },
    });

    const preselected = Number.parseInt(recipeId ?? '', 10);
    const valid =
        !Number.isNaN(preselected) && recipes.some((recipe) => recipe.id === preselected)
            ? preselected
            : null;

    return (
        <main className="container mx-auto max-w-2xl px-4 pb-32 md:px-8">
            <h1 className="border-b border-line pb-6 pt-12 text-3xl font-extrabold tracking-tight sm:pt-16 sm:text-4xl">
                {t('newPost')}
            </h1>

            <div className="pt-8">
                <PostForm
                    initial={{
                        title: '',
                        slug: '',
                        body: '',
                        imageUrl: '',
                        recipeId: valid,
                        published: false,
                    }}
                    recipes={recipes}
                />
            </div>
        </main>
    );
}
