import { getTranslations } from 'next-intl/server';
import Loading from '@/components/ui/Loading';
import { Skeleton } from '@/components/ui/Skeleton';
import { pageContainer, pageTop } from '@/lib/ui';

/** A recipe's outline — picture, title, ingredients — with the oyster above it. */
export default async function RecipeLoading() {
    const t = await getTranslations('Recipe');

    return (
        <main className={`${pageContainer} ${pageTop}`}>
            <Loading label={t('loadingRecipe')} size={28} />
            <Skeleton className="mt-6 aspect-[4/3] w-full rounded-2xl" />
            <Skeleton className="mt-6 h-9 w-3/4" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <div className="mt-8 flex flex-col gap-3" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-4" />
                ))}
            </div>
        </main>
    );
}
