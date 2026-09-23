import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SimilarRecipe } from '@/lib/similarRecipes';

/**
 * Four recipes like this one, under the method.
 *
 * At the bottom rather than beside: somebody reading a recipe is reading a
 * recipe, and a column of other dishes next to the ingredients is an
 * invitation to stop. At the end it is the right question — you have read it,
 * do you want this one or something like it.
 *
 * Nothing is shown when there is nothing worth showing. A row of four weak
 * matches claims a relationship that is not there, and the ranking in
 * lib/similarRecipes already refuses to make that claim.
 */
export default async function SimilarRecipes({ recipes }: { recipes: SimilarRecipe[] }) {
    if (recipes.length === 0) return null;

    const t = await getTranslations('Recipe');

    return (
        <section className="print:hidden mt-16 border-t border-line pt-8">
            <h2 className="mb-5 font-sans text-xs font-bold uppercase tracking-widest text-muted">
                {t('similar')}
            </h2>

            {/* Two across on a phone, four on anything wider — the same square
                tiles as the front page, so this reads as part of the cookbook
                rather than as a recommendation strip. */}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {recipes.map((recipe) => (
                    <li key={recipe.id}>
                        <Link href={`/recipe/${recipe.slug}`} className="group block">
                            <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-surface">
                                {recipe.imageUrl && (
                                    <Image
                                        src={recipe.imageUrl}
                                        alt=""
                                        fill
                                        sizes="(min-width: 640px) 160px, 45vw"
                                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                    />
                                )}
                            </span>

                            <span className="mt-2 block font-sans text-sm font-bold leading-tight text-ink">
                                {recipe.title}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
