import { getTranslations } from 'next-intl/server';
import { collectionOptions, recipeOptions } from '@/lib/pickOptions';
import PostForm from '@/components/post/PostForm';

/**
 * A new entry.
 *
 * `?recipeId=` pre-selects a recipe, which is how the "write a note" link on a
 * recipe page arrives here. It is only a preselection: it can be taken out,
 * and an entry never needs a recipe.
 */
export default async function NewPost({
    searchParams,
}: {
    searchParams: Promise<{ recipeId?: string }>;
}) {
    const { recipeId } = await searchParams;
    const t = await getTranslations('Blog');

    const [recipes, collections] = await Promise.all([recipeOptions(), collectionOptions()]);

    // A draft is not in the list, so `?recipeId=` naming one is simply dropped.
    const preselected = Number.parseInt(recipeId ?? '', 10);
    const valid = recipes.some((recipe) => recipe.id === preselected) ? preselected : null;

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
                        recipeIds: valid === null ? [] : [valid],
                        collectionIds: [],
                        published: false,
                    }}
                    recipes={recipes}
                    collections={collections}
                />
            </div>
        </main>
    );
}
