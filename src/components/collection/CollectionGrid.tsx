import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { photoBadge } from '@/lib/ui';

export interface CollectionEntry {
    id: number;
    title: string;
    slug: string;
    imageUrl: string | null;
}

/**
 * The recipes in a collection, in the order somebody arranged them.
 *
 * Numbered, unlike the front page's grid. A collection is usually a menu or a
 * sequence — first this, then that — and the order is the thing whoever made it
 * spent their attention on. An unnumbered grid throws that away while still
 * displaying it.
 */
export default async function CollectionGrid({
    recipes,
    linkTo,
}: {
    recipes: CollectionEntry[];
    /**
     * Where a tile goes. The private page links to the recipe; the shared page
     * has nowhere to send somebody without an account, so its tiles link
     * nowhere rather than to a sign-in form.
     */
    linkTo: 'recipe' | null;
}) {
    const t = await getTranslations('Collections');

    if (recipes.length === 0) {
        return <p className="py-16 text-center text-muted">{t('empty')}</p>;
    }

    return (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recipes.map((recipe, index) => {
                const tile = (
                    <>
                        <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-surface">
                            {recipe.imageUrl && (
                                <Image
                                    src={recipe.imageUrl}
                                    alt=""
                                    fill
                                    sizes="(min-width: 640px) 220px, 45vw"
                                    className="object-cover"
                                />
                            )}

                            {/* The position, on the picture.
                                
                                This used to be "the same badge the rating uses
                                on the front page". The rating has since come
                                off the photograph, because the oyster does not
                                read at the size a badge can be. A digit does —
                                that is the whole difference, and it is why this
                                one stays where it is rather than following. */}
                            <span className={`${photoBadge} h-7 min-w-7 justify-center px-2 text-xs font-semibold`}>
                                {index + 1}
                            </span>
                        </span>

                        <span className="mt-2 block text-[15px] font-bold leading-tight text-ink">
                            {recipe.title}
                        </span>
                    </>
                );

                return (
                    <li key={recipe.id}>
                        {linkTo === 'recipe' ? (
                            <Link href={`/recipe/${recipe.slug}`} className="group block">
                                {tile}
                            </Link>
                        ) : (
                            <span className="block">{tile}</span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
