import { getTranslations } from 'next-intl/server';
import { recipeOptions } from '@/lib/pickOptions';
import CollectionForm from '@/components/collection/CollectionForm';
import { pageContainer } from '@/lib/ui';
import PageHeader from '@/components/admin/PageHeader';

export default async function NewCollectionPage() {
    const t = await getTranslations('Collections');

    const recipes = await recipeOptions();

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('newTitle')} />

            <CollectionForm
                initial={{ title: '', description: '', imageUrl: '', recipeIds: [] }}
                recipes={recipes}
            />
        </main>
    );
}
