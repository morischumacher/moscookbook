import { getTranslations } from 'next-intl/server';
import IngredientCatalog from '@/components/admin/IngredientCatalog';
import PageHeader from '@/components/admin/PageHeader';
import { linkAllUnlinked } from '@/lib/ingredientCatalog';
import { pageContainer } from '@/lib/ui';

/**
 * The cookbook's ingredients, in both languages (lib/ingredientCatalog).
 * Opening it also points recipes from before the catalogue at their
 * ingredients, a batch at a time; the rest is a button on the page.
 */
export default async function AdminIngredientsPage() {
    const t = await getTranslations('Admin');
    await linkAllUnlinked(200).catch(() => undefined);
    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('ingredients')} />
            <IngredientCatalog />
        </main>
    );
}
