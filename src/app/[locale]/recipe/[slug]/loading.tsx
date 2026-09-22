import { getTranslations } from 'next-intl/server';
import Loading from '@/components/ui/Loading';
import { pageContainer, pageTop } from '@/lib/ui';

/**
 * A recipe is the page most often opened from a list, and the one most often
 * opened on a phone in a kitchen — so it is the other wait worth covering.
 */
export default async function RecipeLoading() {
    const t = await getTranslations('Recipe');

    return (
        <main className={`${pageContainer} ${pageTop}`}>
            <Loading label={t('loadingRecipe')} size={32} />
        </main>
    );
}
